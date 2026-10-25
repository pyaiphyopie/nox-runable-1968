import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { base } from "../__core/app";
import { db } from "../database";
import { entryScans, events, tickets, venues } from "../database/schema";
import { commitScan, decideEntry, scanCounts } from "../lib/entry";
import { mmtClock, mmtWindow } from "../lib/domain";

/** The door. This is where the whole system is judged, so it answers in one round trip. */
export const entry = {
  /**
   * Scan or type a credential. The decision is committed immediately — a door operator
   * cannot be asked to press a second button while a queue forms.
   */
  scan: base
    .input(
      z.object({
        token: z.string().min(4),
        eventId: z.string().optional(),
        scannedBy: z.string().default("door"),
        device: z.string().default("web"),
      }),
    )
    .handler(async ({ input }) => {
      const decision = await decideEntry(input.token, input.eventId);
      const committed = await commitScan(input.token, decision, {
        scannedBy: input.scannedBy,
        device: input.device,
      });
      return committed;
    }),

  /** Dry run — no record written, no state spent. */
  check: base
    .input(z.object({ token: z.string().min(4), eventId: z.string().optional() }))
    .handler(async ({ input }) => decideEntry(input.token, input.eventId)),

  recent: base
    .input(z.object({ eventId: z.string().optional(), limit: z.number().int().min(1).max(50).default(12) }))
    .handler(async ({ input }) => {
      const rows = await db
        .select({
          scan: entryScans,
          ticketStatus: tickets.status,
          eventName: events.name,
        })
        .from(entryScans)
        .leftJoin(tickets, eq(tickets.id, entryScans.ticketId))
        .leftJoin(events, eq(events.id, entryScans.eventId))
        .where(input.eventId ? eq(entryScans.eventId, input.eventId) : undefined)
        .orderBy(desc(entryScans.at))
        .limit(input.limit);

      return rows.map((r) => ({
        id: r.scan.id,
        at: r.scan.at,
        clock: mmtClock(r.scan.at),
        result: r.scan.result,
        reason: r.scan.reason,
        ticketId: r.scan.ticketId,
        ticketStatus: r.ticketStatus,
        eventId: r.scan.eventId,
        eventName: r.eventName,
        scannedBy: r.scan.scannedBy,
        device: r.scan.device,
      }));
    }),

  stats: base.input(z.object({ eventId: z.string().optional() })).handler(async ({ input }) => {
    const counts = await scanCounts(input.eventId);
    return counts;
  }),

  /** Which room is this door standing at? Drives the scanner header. */
  rooms: base.handler(async () => {
    const rows = await db
      .select({ event: events, venue: venues })
      .from(events)
      .leftJoin(venues, eq(venues.id, events.venueId))
      .orderBy(desc(events.doorsAt));
    return rows.map(({ event, venue }) => ({
      id: event.id,
      name: event.name,
      venue: venue?.name ?? "—",
      area: event.area,
      status: event.status,
      window: mmtWindow(event.doorsAt, event.endsAt),
    }));
  }),
};
