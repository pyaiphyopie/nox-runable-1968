import { z } from "zod";
import { and, eq, ne, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { db } from "../database";
import { orders, payments } from "../database/schema";
import { HOLD_MINUTES, holdsUntil } from "../lib/domain";
import { adapterFor } from "../lib/payments";
import { releaseInventory } from "../lib/inventory";
import { issueTicketsForOrder } from "../lib/credentials";
import { writeAudit, track } from "../lib/audit";

/**
 * Manual mobile-money verification, Phase 1 style: the payer moves money in their own
 * wallet app, types the transaction ID back, and a human compares it against the
 * receipt. No PSP call happens anywhere in this file — which is why it is honest about
 * what it can and cannot prove.
 */
export const paymentsRoutes = {
  submitProof: base
    .input(
      z.object({
        orderId: z.string(),
        payerReference: z.string().min(4),
        payerPhone: z.string().optional(),
        receiptUrl: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
      if (!order) throw new ORPCError("NOT_FOUND", { message: "No such order" });
      if (order.status === "VERIFIED") throw new ORPCError("CONFLICT", { message: "Already verified" });
      if (order.status === "EXPIRED") throw new ORPCError("CONFLICT", { message: "Hold expired — start again" });

      const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
      if (!payment) throw new ORPCError("NOT_FOUND", { message: "No payment record on this order" });

      // A transaction id can only back one order. Same id twice is the cheapest fraud
      // there is, so it is flagged at submission time rather than discovered at the door.
      const [clash] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.payerReference, input.payerReference), ne(payments.orderId, order.id)))
        .limit(1);

      const flags = clash ? ["DUPLICATE_REFERENCE"] : [];

      await db
        .update(payments)
        .set({
          payerReference: input.payerReference,
          payerPhone: input.payerPhone ?? null,
          receiptUrl: input.receiptUrl ?? null,
          status: "SUBMITTED",
          flags: flags.join(","),
          reason: null,
        })
        .where(eq(payments.id, payment.id));

      // Verification needs its own window: a human still has to look at this.
      await db
        .update(orders)
        .set({ status: "PROOF_SUBMITTED", holdExpiresAt: holdsUntil(new Date()), updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      await writeAudit({
        actor: `human:${order.userId}`,
        action: "payment.proof_submitted",
        entityType: "order",
        entityId: order.id,
        detail: { ref: order.ref, provider: payment.provider, flags },
      });
      await track("payment.proof_submitted", { userId: order.userId, eventId: order.eventId });

      return {
        ok: true,
        flags,
        holdMinutes: HOLD_MINUTES,
        message: clash
          ? "Submitted, but that transaction ID is already attached to another order. Expect a rejection."
          : "Submitted. A verifier will compare this against the receipt.",
      };
    }),

  /** Approve: the only path that issues credentials. */
  verify: base
    .input(z.object({ orderId: z.string(), overrideFlags: z.boolean().default(false) }))
    .handler(async ({ input }) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
      if (!order) throw new ORPCError("NOT_FOUND", { message: "No such order" });
      if (order.status !== "PROOF_SUBMITTED") {
        throw new ORPCError("CONFLICT", { message: `Order is ${order.status}, not awaiting verification` });
      }

      const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
      if (!payment) throw new ORPCError("NOT_FOUND", { message: "No payment record" });

      if (payment.flags && !input.overrideFlags) {
        throw new ORPCError("CONFLICT", {
          message: `Held by flags: ${payment.flags.split(",").join(", ")}. Override explicitly to approve.`,
        });
      }

      await db
        .update(payments)
        .set({ status: "VERIFIED", verifiedBy: "ops", verifiedAt: new Date(), reason: null })
        .where(eq(payments.id, payment.id));

      const { issued, tickets } = await issueTicketsForOrder(order.id, "human:ops");
      await track("payment.verified", { userId: order.userId, eventId: order.eventId, issued });

      return { ok: true, issued, tickets };
    }),

  /** Reject: inventory goes back on the shelf, the payer is told why. */
  reject: base
    .input(z.object({ orderId: z.string(), reason: z.string().min(3) }))
    .handler(async ({ input }) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
      if (!order) throw new ORPCError("NOT_FOUND", { message: "No such order" });

      const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
      if (!payment) throw new ORPCError("NOT_FOUND", { message: "No payment record" });

      await db
        .update(payments)
        .set({ status: "REJECTED", reason: input.reason, verifiedBy: "ops", verifiedAt: new Date() })
        .where(eq(payments.id, payment.id));
      await db.update(orders).set({ status: "REJECTED", updatedAt: new Date() }).where(eq(orders.id, order.id));
      await releaseInventory(order.tierId, order.qty);

      await writeAudit({
        actor: "human:ops",
        action: "payment.rejected",
        entityType: "order",
        entityId: order.id,
        detail: { ref: order.ref, reason: input.reason, releasedQty: order.qty },
      });
      await track("payment.rejected", { userId: order.userId, eventId: order.eventId });

      return { ok: true, releasedQty: order.qty };
    }),

  /** Adapter catalogue + what a verifier is looking at, for the ops console. */
  adapters: base.handler(() => {
    const providers = ["KBZPAY", "WAVEPAY", "AYAPAY", "CBPAY"];
    return providers.map((p) => {
      const a = adapterFor(p);
      return { id: a.id, label: a.label, payee: a.payee, account: a.payeeAccount, handoff: a.handoff, referenceLabel: a.referenceLabel, accent: a.accent };
    });
  }),

  /** Ops: how much is moving, by provider. Derived, never stored. */
  volume: base.handler(async () => {
    const rows = await db
      .select({
        provider: payments.provider,
        status: payments.status,
        n: sql<number>`count(*)`,
        amount: sql<number>`coalesce(sum(${payments.amountMmk}), 0)`,
      })
      .from(payments)
      .groupBy(payments.provider, payments.status);
    return rows.map((r) => ({ provider: r.provider, status: r.status, count: Number(r.n), amountMmk: Number(r.amount) }));
  }),
};
