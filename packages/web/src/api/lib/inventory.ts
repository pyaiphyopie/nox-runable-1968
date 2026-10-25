import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../database";
import { orders, ticketTiers } from "../database/schema";
import { writeAudit } from "./audit";

/** Hold inventory against a tier. Held inventory counts as unavailable, not as sold. */
export async function holdInventory(tierId: string, qty: number): Promise<void> {
  await db
    .update(ticketTiers)
    .set({ sold: sql`${ticketTiers.sold} + ${qty}` })
    .where(eq(ticketTiers.id, tierId));
}

/** Return inventory to the shelf (hold expiry, rejection, voided credentials). */
export async function releaseInventory(tierId: string, qty: number): Promise<void> {
  await db
    .update(ticketTiers)
    .set({ sold: sql`max(0, ${ticketTiers.sold} - ${qty})` })
    .where(eq(ticketTiers.id, tierId));
}

/**
 * Holds that outlived their window stop being holds. Called at the top of every read
 * path that shows availability, so the numbers a user sees are never stale.
 */
export async function releaseExpiredHolds(): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000);
  const stale = await db
    .select({ id: orders.id, tierId: orders.tierId, qty: orders.qty, ref: orders.ref, status: orders.status })
    .from(orders)
    .where(and(inArray(orders.status, ["AWAITING_PAYMENT", "PROOF_SUBMITTED"]), lt(orders.holdExpiresAt, new Date(nowSec * 1000))));

  for (const order of stale) {
    await db
      .update(orders)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await releaseInventory(order.tierId, order.qty);
    await writeAudit({
      actor: "system",
      action: "order.expired",
      entityType: "order",
      entityId: order.id,
      detail: { ref: order.ref, releasedQty: order.qty, previousStatus: order.status },
    });
  }

  return stale.length;
}
