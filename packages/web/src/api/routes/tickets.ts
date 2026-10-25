import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { db } from "../database";
import { events, orders, ticketTiers, tickets, venues } from "../database/schema";
import { mmtClock, mmtWindow } from "../lib/domain";
import { ticketQr } from "../lib/credentials";
import { verifyTicket } from "../lib/ticket-token";
import { userName, userForRole } from "../lib/session";

async function ticketView(ticketId: string) {
  const [row] = await db
    .select({ ticket: tickets, order: orders, event: events, tier: ticketTiers, venue: venues })
    .from(tickets)
    .leftJoin(orders, eq(orders.id, tickets.orderId))
    .leftJoin(events, eq(events.id, tickets.eventId))
    .leftJoin(ticketTiers, eq(ticketTiers.id, tickets.tierId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(eq(tickets.id, ticketId));

  if (!row) return null;

  return {
    id: row.ticket.id,
    seq: row.ticket.seq,
    status: row.ticket.status,
    token: row.ticket.token,
    qrSvg: await ticketQr(row.ticket.token),
    orderRef: row.order?.ref ?? null,
    orderId: row.order?.id ?? null,
    issuedAt: row.ticket.issuedAt,
    scannedAt: row.ticket.scannedAt,
    holder: await userName(row.ticket.holderId),
    tier: row.tier?.name ?? "—",
    priceMmk: row.tier?.priceMmk ?? 0,
    event: {
      id: row.event?.id ?? "",
      name: row.event?.name ?? "—",
      venue: row.venue?.name ?? "—",
      area: row.event?.area ?? "",
      window: row.event && row.event.doorsAt ? mmtWindow(row.event.doorsAt, row.event.endsAt) : "",
      lineup: (row.event?.lineup ?? "").split(" · ").filter(Boolean),
    },
  };
}

export const ticketsRoutes = {
  /** Consumer: credentials I hold, newest first. */
  mine: base.handler(async () => {
    const userId = await userForRole("consumer");
    const rows = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.holderId, userId))
      .orderBy(desc(tickets.createdAt))
      .limit(20);
    const views = await Promise.all(rows.map((r) => ticketView(r.id)));
    return views.filter(Boolean);
  }),

  get: base.input(z.object({ ticketId: z.string() })).handler(async ({ input }) => {
    const view = await ticketView(input.ticketId);
    if (!view) throw new ORPCError("NOT_FOUND", { message: "No such ticket" });
    return view;
  }),

  /** Everything issued against one order, with QRs — what the consumer shows at the door. */
  forOrder: base.input(z.object({ orderId: z.string() })).handler(async ({ input }) => {
    const rows = await db.select().from(tickets).where(eq(tickets.orderId, input.orderId));
    const views = await Promise.all(rows.map((r) => ticketView(r.id)));
    return views.filter(Boolean);
  }),

  /**
   * Inspect a token without spending it. The door uses this for a preview, and the
   * consumer app uses it to prove a credential is still live.
   */
  inspect: base.input(z.object({ token: z.string() })).handler(async ({ input }) => {
    const verdict = verifyTicket(input.token);
    if (!verdict.ok) return { valid: false as const, reason: verdict.reason };

    const [row] = await db
      .select({ ticket: tickets, order: orders, event: events })
      .from(tickets)
      .leftJoin(orders, eq(orders.id, tickets.orderId))
      .leftJoin(events, eq(events.id, tickets.eventId))
      .where(eq(tickets.id, verdict.payload.t));

    if (!row) return { valid: false as const, reason: "UNKNOWN_TICKET" };

    return {
      valid: row.ticket.status === "ISSUED" && row.order?.status === "VERIFIED",
      reason: row.ticket.status,
      ticketId: row.ticket.id,
      orderRef: row.order?.ref ?? null,
      eventId: row.ticket.eventId,
      eventName: row.event?.name ?? null,
      status: row.ticket.status,
      orderStatus: row.order?.status ?? null,
      scannedAt: row.ticket.scannedAt ? mmtClock(row.ticket.scannedAt) : null,
    };
  }),
};
