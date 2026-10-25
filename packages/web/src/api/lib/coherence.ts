import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../database";
import { entryScans, orders, payments, ticketTiers, tickets } from "../database/schema";

/**
 * The invariant the whole product rests on: payment, ticket and entry must not disagree.
 * These checks run against real rows — nothing here is simulated — and every violation
 * carries the exact repair the ops console can apply to it.
 */
export interface Violation {
  code: string;
  severity: "warn" | "critical";
  title: string;
  detail: string;
  entityType: "order" | "ticket" | "tier" | "scan";
  entityId: string;
  eventId: string | null;
  action: RepairAction;
}

export type RepairAction =
  | "void_tickets"
  | "issue_tickets"
  | "expire_order"
  | "flag_scan"
  | "reconcile_payment";

export interface ViolationRepair {
  code: string;
  action: RepairAction;
  summary: string;
}

/** Human-readable meaning of each repair, so the console never applies a mystery verb. */
export const REPAIR_MEANING: Record<RepairAction, string> = {
  void_tickets: "Voids the live credential rows and returns their inventory to the tier.",
  issue_tickets: "Issues the credential rows this verified payment is owed.",
  expire_order: "Expires the order and releases its held inventory.",
  flag_scan: "Prefixes the door record's reason with FLAGGED — the original reason is kept — and audits it.",
  reconcile_payment: "Moves the order back to the verification queue for a human verdict.",
};

export async function findViolations(eventId?: string): Promise<Violation[]> {
  const out: Violation[] = [];
  const now = new Date();

  // Credentials that exist while the money behind them is not verified.
  const credRows = await db
    .select({
      ticketId: tickets.id,
      ticketStatus: tickets.status,
      eventId: tickets.eventId,
      orderId: orders.id,
      orderRef: orders.ref,
      orderStatus: orders.status,
      paymentStatus: payments.status,
    })
    .from(tickets)
    .leftJoin(orders, eq(orders.id, tickets.orderId))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(
      eventId
        ? and(inArray(tickets.status, ["ISSUED", "SCANNED"]), eq(tickets.eventId, eventId))
        : inArray(tickets.status, ["ISSUED", "SCANNED"]),
    );

  for (const row of credRows) {
    if (row.paymentStatus === "REJECTED") {
      out.push({
        code: "CREDENTIAL_ON_REJECTED_PAYMENT",
        severity: "critical",
        title: `Live ticket on rejected payment · ${row.orderRef ?? "unknown order"}`,
        detail: `Ticket ${row.ticketId} is ${row.ticketStatus} while its payment is REJECTED. A rejected payer can walk in on a valid credential.`,
        entityType: "order",
        entityId: row.orderId ?? "",
        eventId: row.eventId,
        action: "void_tickets",
      });
    } else if (row.orderStatus && row.orderStatus !== "VERIFIED") {
      out.push({
        code: "CREDENTIAL_WITHOUT_VERIFIED_PAYMENT",
        severity: "critical",
        title: `Ticket issued before verification · ${row.orderRef ?? "unknown order"}`,
        detail: `Ticket ${row.ticketId} is ${row.ticketStatus} but the order is ${row.orderStatus}. Only a verified payment may issue a credential.`,
        entityType: "order",
        entityId: row.orderId ?? "",
        eventId: row.eventId,
        action: "void_tickets",
      });
    }
  }

  // Verified money with nothing issued against it.
  const verified = await db
    .select({ id: orders.id, ref: orders.ref, eventId: orders.eventId, status: orders.status })
    .from(orders)
    .where(eventId ? and(eq(orders.status, "VERIFIED"), eq(orders.eventId, eventId)) : eq(orders.status, "VERIFIED"));

  if (verified.length) {
    const counts = await db
      .select({ orderId: tickets.orderId, n: sql<number>`count(*)` })
      .from(tickets)
      .where(
        inArray(
          tickets.orderId,
          verified.map((o) => o.id),
        ),
      )
      .groupBy(tickets.orderId);
    const byOrder = new Map(counts.map((c) => [c.orderId, Number(c.n)]));
    for (const order of verified) {
      const n = byOrder.get(order.id) ?? 0;
      if (n === 0) {
        out.push({
          code: "PAID_NO_CREDENTIAL",
          severity: "critical",
          title: `Verified payment, no ticket · ${order.ref}`,
          detail: `Order ${order.ref} is VERIFIED but has no credential rows. The payer has no way in.`,
          entityType: "order",
          entityId: order.id,
          eventId: order.eventId,
          action: "issue_tickets",
        });
      }
    }
  }

  // Holds that outlived their window while still open.
  const stale = await db
    .select({ id: orders.id, ref: orders.ref, eventId: orders.eventId, status: orders.status, holdExpiresAt: orders.holdExpiresAt })
    .from(orders)
    .where(and(inArray(orders.status, ["AWAITING_PAYMENT", "PROOF_SUBMITTED"]), sql`${orders.holdExpiresAt} < ${Math.floor(now.getTime() / 1000)}`));

  for (const order of stale) {
    out.push({
      code: "HOLD_PAST_EXPIRY",
      severity: "warn",
      title: `Held inventory past its window · ${order.ref}`,
      detail: `Order ${order.ref} is ${order.status} and its hold expired. The seat is neither sold nor back on the shelf.`,
      entityType: "order",
      entityId: order.id,
      eventId: order.eventId,
      action: "expire_order",
    });
  }

  // Door records that accepted something the credential does not support.
  const badScans = await db
    .select({ scanId: entryScans.id, eventId: entryScans.eventId, ticketId: entryScans.ticketId, ticketStatus: tickets.status })
    .from(entryScans)
    .leftJoin(tickets, eq(tickets.id, entryScans.ticketId))
    .where(and(eq(entryScans.result, "ACCEPTED"), isNotNull(entryScans.ticketId)));

  for (const scan of badScans) {
    if (scan.ticketStatus !== "ISSUED" && scan.ticketStatus !== "SCANNED") {
      out.push({
        code: "ENTRY_WITHOUT_VALID_CREDENTIAL",
        severity: "critical",
        title: `Accepted entry on a ${scan.ticketStatus ?? "missing"} ticket`,
        detail: `Door record ${scan.scanId} accepted entry, but its credential is ${scan.ticketStatus ?? "gone"}.`,
        entityType: "scan",
        entityId: scan.scanId,
        eventId: scan.eventId,
        action: "flag_scan",
      });
    }
  }

  // Inventory that went past the cap.
  const oversold = await db
    .select({ id: ticketTiers.id, eventId: ticketTiers.eventId, name: ticketTiers.name, sold: ticketTiers.sold, capacity: ticketTiers.capacity })
    .from(ticketTiers)
    .where(and(sql`${ticketTiers.sold} > ${ticketTiers.capacity}`, eventId ? eq(ticketTiers.eventId, eventId) : ne(ticketTiers.id, "")));

  for (const tier of oversold) {
    out.push({
      code: "TIER_OVERSOLD",
      severity: "critical",
      title: `Oversold tier · ${tier.name}`,
      detail: `${tier.sold} held against a cap of ${tier.capacity}.`,
      entityType: "tier",
      entityId: tier.id,
      eventId: tier.eventId,
      action: "expire_order",
    });
  }

  return out;
}
