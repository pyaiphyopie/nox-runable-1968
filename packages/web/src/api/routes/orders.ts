import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { db } from "../database";
import { events, orders, payments, ticketTiers, tickets, venues } from "../database/schema";
import { newId, orderRef } from "../lib/ids";
import { HOLD_MINUTES, holdsUntil, mmtWindow, canTransitionOrder } from "../lib/domain";
import { adapterFor, PAYMENT_ADAPTERS, VERIFICATION_CHECKLIST } from "../lib/payments";
import { holdInventory, releaseInventory, releaseExpiredHolds } from "../lib/inventory";
import { writeAudit, track } from "../lib/audit";
import { userForRole } from "../lib/session";

async function orderView(orderId: string) {
  const [row] = await db
    .select({ order: orders, payment: payments, event: events, tier: ticketTiers, venue: venues })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .leftJoin(events, eq(events.id, orders.eventId))
    .leftJoin(ticketTiers, eq(ticketTiers.id, orders.tierId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(eq(orders.id, orderId));

  if (!row) return null;

  const holder = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
  const adapter = adapterFor(row.payment?.provider ?? "KBZPAY");
  const holdMs = row.order.holdExpiresAt.getTime() - Date.now();

  return {
    id: row.order.id,
    ref: row.order.ref,
    status: row.order.status,
    qty: row.order.qty,
    amountMmk: row.order.amountMmk,
    createdAt: row.order.createdAt,
    holdExpiresAt: row.order.holdExpiresAt,
    holdSecondsLeft: Math.max(0, Math.floor(holdMs / 1000)),
    event: {
      id: row.event?.id ?? "",
      name: row.event?.name ?? "—",
      venue: row.venue?.name ?? "—",
      area: row.event?.area ?? "",
      window: row.event && row.event.doorsAt ? mmtWindow(row.event.doorsAt, row.event.endsAt) : "",
    },
    tier: { id: row.tier?.id ?? "", name: row.tier?.name ?? "—", priceMmk: row.tier?.priceMmk ?? 0 },
    payment: row.payment
      ? {
          id: row.payment.id,
          provider: row.payment.provider,
          status: row.payment.status,
          payerReference: row.payment.payerReference,
          payerPhone: row.payment.payerPhone,
          receiptUrl: row.payment.receiptUrl,
          reason: row.payment.reason,
          flags: row.payment.flags ? row.payment.flags.split(",").filter(Boolean) : [],
          verifiedAt: row.payment.verifiedAt,
        }
      : null,
    adapter,
    tickets: holder.map((t) => ({ id: t.id, seq: t.seq, status: t.status, token: t.token, scannedAt: t.scannedAt })),
  };
}

export const ordersRoutes = {
  /**
   * Create a purchase. Inventory is held immediately and the hold has a clock on it.
   * The idempotency key is the client's protection against a double tap on a slow
   * network: the same key can only ever produce one order.
   */
  create: base
    .input(
      z.object({
        eventId: z.string(),
        tierId: z.string(),
        qty: z.number().int().min(1).max(6),
        provider: z.string(),
        idempotencyKey: z.string().min(6),
      }),
    )
    .handler(async ({ input }) => {
      await releaseExpiredHolds();

      const [existing] = await db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey));
      if (existing) {
        return { order: await orderView(existing.id), replayed: true };
      }

      const [tier] = await db.select().from(ticketTiers).where(eq(ticketTiers.id, input.tierId));
      if (!tier || tier.eventId !== input.eventId) {
        throw new ORPCError("BAD_REQUEST", { message: "That tier does not belong to this room" });
      }
      if (tier.status !== "open") throw new ORPCError("BAD_REQUEST", { message: "Tier is closed" });

      const remaining = tier.capacity - tier.sold;
      if (remaining < input.qty) {
        throw new ORPCError("CONFLICT", {
          message: `Only ${remaining} left in ${tier.name}`,
        });
      }

      const userId = await userForRole("consumer");
      const orderId = newId("ord");
      const paymentId = newId("pay");
      const amountMmk = tier.priceMmk * input.qty;

      await holdInventory(input.tierId, input.qty);
      await db.insert(orders).values({
        id: orderId,
        ref: orderRef(),
        userId,
        eventId: input.eventId,
        tierId: input.tierId,
        qty: input.qty,
        amountMmk,
        status: "AWAITING_PAYMENT",
        holdExpiresAt: holdsUntil(new Date()),
        idempotencyKey: input.idempotencyKey,
      });
      await db.insert(payments).values({
        id: paymentId,
        orderId,
        provider: adapterFor(input.provider).id,
        amountMmk,
        status: "AWAITING_PAYMENT",
      });

      await writeAudit({
        actor: `human:${userId}`,
        action: "order.created",
        entityType: "order",
        entityId: orderId,
        detail: { tier: tier.name, qty: input.qty, amountMmk, provider: input.provider },
      });
      await track("checkout.started", { userId, eventId: input.eventId, amountMmk });

      return { order: await orderView(orderId), replayed: false };
    }),

  get: base.input(z.object({ orderId: z.string() })).handler(async ({ input }) => {
    await releaseExpiredHolds();
    const view = await orderView(input.orderId);
    if (!view) throw new ORPCError("NOT_FOUND", { message: "No such order" });
    return view;
  }),

  /** Consumer's own orders. */
  mine: base.handler(async () => {
    await releaseExpiredHolds();
    const userId = await userForRole("consumer");
    const rows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(20);
    const views = await Promise.all(rows.map((r) => orderView(r.id)));
    return views.filter(Boolean);
  }),

  /** Ops: everything waiting on a human verdict, plus what was decided recently. */
  verificationQueue: base.handler(async () => {
    await releaseExpiredHolds();
    const pending = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.status, "PROOF_SUBMITTED"))
      .orderBy(desc(orders.updatedAt));
    const recent = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.status, "VERIFIED"))
      .orderBy(desc(orders.updatedAt))
      .limit(6);
    return {
      pending: (await Promise.all(pending.map((p) => orderView(p.id)))).filter(Boolean),
      recent: (await Promise.all(recent.map((p) => orderView(p.id)))).filter(Boolean),
      checklist: VERIFICATION_CHECKLIST,
      adapters: PAYMENT_ADAPTERS,
    };
  }),

  /** Consumer abandons the hold; inventory goes straight back. */
  abandon: base.input(z.object({ orderId: z.string() })).handler(async ({ input }) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
    if (!order) throw new ORPCError("NOT_FOUND", { message: "No such order" });
    if (!canTransitionOrder(order.status as "AWAITING_PAYMENT", "EXPIRED")) {
      throw new ORPCError("CONFLICT", { message: `Order is ${order.status}; nothing to abandon` });
    }
    await db.update(orders).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(orders.id, order.id));
    await releaseInventory(order.tierId, order.qty);
    await writeAudit({
      actor: `human:${order.userId}`,
      action: "order.abandoned",
      entityType: "order",
      entityId: order.id,
      detail: { ref: order.ref },
    });
    await track("checkout.abandoned", { userId: order.userId, eventId: order.eventId });
    return { ok: true, releasedQty: order.qty, holdMinutes: HOLD_MINUTES };
  }),
};
