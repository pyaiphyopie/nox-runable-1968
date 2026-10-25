import { and, eq, sql } from "drizzle-orm";
import { db } from "../database";
import { entryScans, events, orders, ticketTiers, tickets, users, venues } from "../database/schema";
import { newId } from "./ids";
import { verifyTicket } from "./ticket-token";
import { mmtClock, mmtWindow } from "./domain";
import { writeAudit, track } from "./audit";

export interface EntryDecision {
  result: "ACCEPTED" | "REJECTED";
  reason: string;
  gateMessage: string;
  ticketId: string | null;
  ticketStatus: string | null;
  orderRef: string | null;
  holder: string | null;
  tier: string | null;
  eventId: string | null;
  eventName: string | null;
  venue: string | null;
  window: string | null;
  scannedAt: Date | null;
  /** Why the door is allowed to trust this: the checks that ran, in order. */
  checks: Array<{ name: string; pass: boolean; detail: string }>;
}

/**
 * The door's decision. A signature only proves we issued the token; the ticket row
 * still has to agree that the money behind it was verified and that nobody has used
 * it yet. Every check is returned so the operator can see the reasoning, not a verdict.
 */
export async function decideEntry(rawToken: string, eventId?: string): Promise<EntryDecision> {
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
  const base: EntryDecision = {
    result: "REJECTED",
    reason: "MALFORMED",
    gateMessage: "Not a NOX credential.",
    ticketId: null,
    ticketStatus: null,
    orderRef: null,
    holder: null,
    tier: null,
    eventId: null,
    eventName: null,
    venue: null,
    window: null,
    scannedAt: null,
    checks,
  };

  const verdict = verifyTicket(rawToken);
  checks.push({
    name: "signature",
    pass: verdict.ok,
    detail: verdict.ok ? "Signed by this server" : `Rejected: ${verdict.reason}`,
  });
  if (!verdict.ok) return base;

  const [row] = await db
    .select({
      ticket: tickets,
      order: orders,
      event: events,
      tier: ticketTiers,
      holder: users,
      venue: venues,
    })
    .from(tickets)
    .leftJoin(orders, eq(orders.id, tickets.orderId))
    .leftJoin(events, eq(events.id, tickets.eventId))
    .leftJoin(ticketTiers, eq(ticketTiers.id, tickets.tierId))
    .leftJoin(users, eq(users.id, tickets.holderId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(eq(tickets.id, verdict.payload.t));

  checks.push({ name: "ticket record", pass: Boolean(row), detail: row ? "Found on this server" : "Unknown ticket id" });
  if (!row) {
    return { ...base, reason: "UNKNOWN_TICKET", gateMessage: "Credential is not in the ticket record." };
  }

  const shaped: EntryDecision = {
    ...base,
    ticketId: row.ticket.id,
    ticketStatus: row.ticket.status,
    orderRef: row.order?.ref ?? null,
    holder: row.holder?.name ?? null,
    tier: row.tier?.name ?? null,
    eventId: row.ticket.eventId,
    eventName: row.event?.name ?? null,
    venue: row.venue?.name ?? null,
    window: row.event ? mmtWindow(row.event.doorsAt, row.event.endsAt) : null,
    scannedAt: row.ticket.scannedAt,
  };

  const wrongEvent = Boolean(eventId && row.ticket.eventId !== eventId);
  checks.push({
    name: "room",
    pass: !wrongEvent,
    detail: wrongEvent ? `Credential is for a different room` : "Matches this door",
  });
  if (wrongEvent) {
    return { ...shaped, reason: "WRONG_EVENT", gateMessage: "This credential is for another room." };
  }

  const paymentOk = row.order?.status === "VERIFIED";
  checks.push({
    name: "payment verified",
    pass: paymentOk,
    detail: paymentOk ? "Order VERIFIED" : `Order is ${row.order?.status ?? "missing"}`,
  });

  const unused = row.ticket.status === "ISSUED";
  checks.push({
    name: "single use",
    pass: unused,
    detail: unused
      ? "Not used yet"
      : row.ticket.status === "SCANNED"
        ? `Already used at ${row.ticket.scannedAt ? mmtClock(row.ticket.scannedAt) : "an earlier scan"}`
        : `Ticket is ${row.ticket.status}`,
  });

  if (row.ticket.status === "SCANNED") {
    return { ...shaped, reason: "ALREADY_USED", gateMessage: "Already inside. Do not re-admit." };
  }
  if (row.ticket.status === "VOID") {
    return { ...shaped, reason: "VOIDED", gateMessage: "Credential was voided. Send to the desk." };
  }
  if (!paymentOk) {
    return { ...shaped, reason: "PAYMENT_NOT_VERIFIED", gateMessage: "Money is not verified. Send to the desk." };
  }
  if (!unused) {
    return { ...shaped, reason: "NOT_ISSUED", gateMessage: "No live credential. Send to the desk." };
  }

  return { ...shaped, result: "ACCEPTED", reason: "OK", gateMessage: "Admit." };
}

/** Commit the decision. Writes the door's own record either way. */
export async function commitScan(
  rawToken: string,
  decision: EntryDecision,
  opts: { scannedBy: string; device: string },
): Promise<EntryDecision> {
  const now = new Date();
  const accepted = decision.result === "ACCEPTED";

  if (accepted && decision.ticketId) {
    // Guarded update: if another device flipped it between decision and commit, the
    // WHERE clause matches nothing and we do not admit twice.
    const updated = await db
      .update(tickets)
      .set({ status: "SCANNED", scannedAt: now })
      .where(and(eq(tickets.id, decision.ticketId), eq(tickets.status, "ISSUED")))
      .returning({ id: tickets.id });

    if (!updated.length) {
      const denied: EntryDecision = {
        ...decision,
        result: "REJECTED",
        reason: "RACE_ALREADY_USED",
        gateMessage: "Already scanned at another device. Do not re-admit.",
      };
      await recordScan(rawToken, denied, opts, now);
      return denied;
    }
  }

  await recordScan(rawToken, decision, opts, now);
  return { ...decision, scannedAt: accepted ? now : decision.scannedAt };
}

async function recordScan(
  rawToken: string,
  decision: EntryDecision,
  opts: { scannedBy: string; device: string },
  at: Date,
): Promise<void> {
  await db.insert(entryScans).values({
    id: newId("scn"),
    ticketId: decision.ticketId,
    eventId: decision.eventId,
    tokenInput: rawToken.slice(0, 12),
    result: decision.result,
    reason: decision.reason,
    scannedBy: opts.scannedBy,
    device: opts.device,
    at,
  });

  await writeAudit({
    actor: `human:${opts.scannedBy}`,
    action: decision.result === "ACCEPTED" ? "ticket.scanned" : "ticket.scan_rejected",
    entityType: "ticket",
    entityId: decision.ticketId ?? "unknown",
    detail: { reason: decision.reason, device: opts.device, orderRef: decision.orderRef },
  });

  await track("entry.scanned", {
    eventId: decision.eventId ?? undefined,
    result: decision.result,
    reason: decision.reason,
  });
}

export async function scanCounts(eventId?: string) {
  const rows = await db
    .select({ result: entryScans.result, n: sql<number>`count(*)` })
    .from(entryScans)
    .where(eventId ? eq(entryScans.eventId, eventId) : undefined)
    .groupBy(entryScans.result);
  const accepted = Number(rows.find((r) => r.result === "ACCEPTED")?.n ?? 0);
  const rejected = Number(rows.find((r) => r.result === "REJECTED")?.n ?? 0);
  return { accepted, rejected, total: accepted + rejected };
}
