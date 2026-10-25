import { eq } from "drizzle-orm";
import { db } from "../database";
import { orders, tickets, users } from "../database/schema";
import { newId, nonce } from "./ids";
import { signTicket, qrSvg } from "./ticket-token";
import { writeAudit } from "./audit";

/**
 * Issue the credential rows an order is owed. Idempotent: calling it twice never
 * double-issues, because the second call returns what the first one wrote.
 */
export async function issueTicketsForOrder(
  orderId: string,
  actor: `human:${string}` | `agent:${string}` | "system",
): Promise<{ issued: number; tickets: Array<{ id: string; token: string; seq: number }> }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new Error(`No such order: ${orderId}`);

  const existing = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
  if (existing.length) {
    return {
      issued: 0,
      tickets: existing.map((t) => ({ id: t.id, token: t.token, seq: t.seq })),
    };
  }

  const created: Array<{ id: string; token: string; seq: number }> = [];
  for (let i = 1; i <= order.qty; i++) {
    const id = newId("tkt");
    const token = signTicket({ t: id, e: order.eventId, r: order.ref, n: nonce() });
    await db.insert(tickets).values({
      id,
      orderId,
      eventId: order.eventId,
      tierId: order.tierId,
      holderId: order.userId,
      seq: i,
      token,
      status: "ISSUED",
      issuedAt: new Date(),
    });
    created.push({ id, token, seq: i });
  }

  await db.update(orders).set({ status: "VERIFIED", updatedAt: new Date() }).where(eq(orders.id, orderId));

  await writeAudit({
    actor,
    action: "ticket.issued",
    entityType: "order",
    entityId: orderId,
    detail: { ref: order.ref, count: created.length, tierId: order.tierId },
  });

  return { issued: created.length, tickets: created };
}

/** Void live credentials for an order and put their inventory back on the shelf. */
export async function voidTicketsForOrder(
  orderId: string,
  actor: `human:${string}` | `agent:${string}` | "system",
  reason: string,
): Promise<number> {
  const rows = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
  const live = rows.filter((t) => t.status === "ISSUED");
  for (const t of live) {
    await db.update(tickets).set({ status: "VOID" }).where(eq(tickets.id, t.id));
  }
  if (live.length) {
    await writeAudit({
      actor,
      action: "ticket.voided",
      entityType: "order",
      entityId: orderId,
      detail: { count: live.length, reason },
    });
  }
  return live.length;
}

/** Render the QR for a token. SVG is produced server-side so no client library is trusted. */
export async function ticketQr(token: string): Promise<string> {
  return qrSvg(token);
}

export async function holderName(userId: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user?.name ?? "Unknown holder";
}
