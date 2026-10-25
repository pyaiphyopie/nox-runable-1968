import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { db } from "../database";
import { events, ticketTiers, tickets, venues } from "../database/schema";
import { newId } from "../lib/ids";
import { mmtWindow, percent } from "../lib/domain";
import { writeAudit, track } from "../lib/audit";

/** Live inventory per event: issued credentials vs inventory still held by open orders. */
async function inventoryFor(eventIds: string[]) {
  if (!eventIds.length) return { tiers: [], issued: new Map<string, number>() };

  const tiers = await db
    .select()
    .from(ticketTiers)
    .where(inArray(ticketTiers.eventId, eventIds))
    .orderBy(asc(ticketTiers.sortOrder));

  const issuedRows = await db
    .select({ eventId: tickets.eventId, n: sql<number>`count(*)` })
    .from(tickets)
    .where(and(inArray(tickets.eventId, eventIds), inArray(tickets.status, ["ISSUED", "SCANNED"])))
    .groupBy(tickets.eventId);

  return { tiers, issued: new Map(issuedRows.map((r) => [r.eventId, Number(r.n)])) };
}

export const eventsRoutes = {
  /** Tonight's rooms, with numbers derived from inventory — nothing hardcoded. */
  list: base.handler(async () => {
    const rows = await db
      .select({ event: events, venue: venues })
      .from(events)
      .leftJoin(venues, eq(venues.id, events.venueId))
      .orderBy(asc(events.doorsAt));

    const ids = rows.map((r) => r.event.id);
    const { tiers, issued } = await inventoryFor(ids);

    return rows.map(({ event, venue }) => {
      const own = tiers.filter((t) => t.eventId === event.id);
      const sold = issued.get(event.id) ?? 0;
      const heldTotal = own.reduce((sum, t) => sum + t.sold, 0);
      const from = own.length ? Math.min(...own.map((t) => t.priceMmk)) : 0;
      const remaining = own.reduce((sum, t) => sum + Math.max(0, t.capacity - t.sold), 0);
      return {
        id: event.id,
        name: event.name,
        venue: venue?.name ?? "—",
        area: event.area,
        genre: event.genre,
        blurb: event.blurb,
        artKey: event.artKey,
        status: event.status,
        window: mmtWindow(event.doorsAt, event.endsAt),
        capacity: event.capacity,
        issued: sold,
        held: Math.max(0, heldTotal - sold),
        occupancy: percent(heldTotal, event.capacity),
        remaining,
        fromPrice: from,
        tierCount: own.length,
        soldOut: remaining === 0,
      };
    });
  }),

  /** One room in full: tiers with live remaining, capacity state, lineup. */
  get: base.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const [row] = await db
      .select({ event: events, venue: venues })
      .from(events)
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(eq(events.id, input.id));

    if (!row) throw new ORPCError("NOT_FOUND", { message: "No such room" });

    const tiers = await db
      .select()
      .from(ticketTiers)
      .where(eq(ticketTiers.eventId, input.id))
      .orderBy(asc(ticketTiers.sortOrder));

    const [issuedRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(tickets)
      .where(and(eq(tickets.eventId, input.id), inArray(tickets.status, ["ISSUED", "SCANNED"])));

    const sold = Number(issuedRow?.n ?? 0);
    const heldTotal = tiers.reduce((sum, t) => sum + t.sold, 0);

    await track("room.viewed", { eventId: input.id });

    return {
      id: row.event.id,
      name: row.event.name,
      venue: row.venue?.name ?? "—",
      venueArea: row.venue?.area ?? row.event.area,
      area: row.event.area,
      genre: row.event.genre,
      blurb: row.event.blurb,
      lineup: row.event.lineup.split(" · ").filter(Boolean),
      artKey: row.event.artKey,
      status: row.event.status,
      window: mmtWindow(row.event.doorsAt, row.event.endsAt),
      doorsAt: row.event.doorsAt,
      capacity: row.event.capacity,
      issued: sold,
      held: Math.max(0, heldTotal - sold),
      occupancy: percent(heldTotal, row.event.capacity),
      tiers: tiers.map((t) => ({
        id: t.id,
        name: t.name,
        priceMmk: t.priceMmk,
        capacity: t.capacity,
        held: t.sold,
        remaining: Math.max(0, t.capacity - t.sold),
        status: t.status,
      })),
    };
  }),

  /** Door + venue ops view: what the room looks like right now. */
  state: base.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const [event] = await db.select().from(events).where(eq(events.id, input.id));
    if (!event) throw new ORPCError("NOT_FOUND", { message: "No such room" });

    const [issuedRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(tickets)
      .where(and(eq(tickets.eventId, input.id), inArray(tickets.status, ["ISSUED", "SCANNED"])));

    const [inRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(tickets)
      .where(and(eq(tickets.eventId, input.id), eq(tickets.status, "SCANNED")));

    const issued = Number(issuedRow?.n ?? 0);
    const inside = Number(inRow?.n ?? 0);

    return {
      eventId: event.id,
      name: event.name,
      capacity: event.capacity,
      issued,
      inside,
      outside: Math.max(0, issued - inside),
      occupancy: percent(inside, event.capacity),
      window: mmtWindow(event.doorsAt, event.endsAt),
    };
  }),

  /** Organizer: create a room. */
  create: base
    .input(
      z.object({
        name: z.string().min(2),
        venueName: z.string().min(2),
        area: z.string().min(2),
        genre: z.string().min(2),
        blurb: z.string().default(""),
        lineup: z.string().default(""),
        doorsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        capacity: z.number().int().positive(),
        artKey: z.string().default("a"),
        promoter: z.string().default("Independent"),
        tiers: z
          .array(
            z.object({
              name: z.string().min(1),
              priceMmk: z.number().int().nonnegative(),
              capacity: z.number().int().positive(),
            }),
          )
          .min(1),
      }),
    )
    .handler(async ({ input }) => {
      const [existingVenue] = await db.select().from(venues).where(eq(venues.name, input.venueName));
      const venueId = existingVenue?.id ?? newId("ven");
      if (!existingVenue) {
        await db.insert(venues).values({
          id: venueId,
          name: input.venueName,
          area: input.area,
          capacity: input.capacity,
        });
      }

      const eventId = newId("evt");
      await db.insert(events).values({
        id: eventId,
        venueId,
        name: input.name,
        genre: input.genre,
        area: input.area,
        blurb: input.blurb,
        lineup: input.lineup,
        doorsAt: input.doorsAt,
        endsAt: input.endsAt,
        capacity: input.capacity,
        artKey: input.artKey,
        status: "on_sale",
      });

      await db.insert(ticketTiers).values(
        input.tiers.map((t, i) => ({
          id: newId("tier"),
          eventId,
          name: t.name,
          priceMmk: t.priceMmk,
          capacity: t.capacity,
          sortOrder: i,
        })),
      );

      await writeAudit({
        actor: "human:organizer",
        action: "event.created",
        entityType: "event",
        entityId: eventId,
        detail: { name: input.name, venue: input.venueName, tiers: input.tiers.length },
      });
      await track("event.created", { eventId, name: input.name });

      return { id: eventId };
    }),

  /** Organizer: add a tier to an existing room. */
  addTier: base
    .input(
      z.object({
        eventId: z.string(),
        name: z.string().min(1),
        priceMmk: z.number().int().nonnegative(),
        capacity: z.number().int().positive(),
      }),
    )
    .handler(async ({ input }) => {
      const [event] = await db.select().from(events).where(eq(events.id, input.eventId));
      if (!event) throw new ORPCError("NOT_FOUND", { message: "No such room" });

      const existing = await db.select().from(ticketTiers).where(eq(ticketTiers.eventId, input.eventId));
      const id = newId("tier");
      await db.insert(ticketTiers).values({
        id,
        eventId: input.eventId,
        name: input.name,
        priceMmk: input.priceMmk,
        capacity: input.capacity,
        sortOrder: existing.length,
      });
      await writeAudit({
        actor: "human:organizer",
        action: "tier.created",
        entityType: "tier",
        entityId: id,
        detail: { eventId: input.eventId, name: input.name, priceMmk: input.priceMmk },
      });
      return { id };
    }),

  /** Organizer: open or close a room. */
  setStatus: base
    .input(z.object({ eventId: z.string(), status: z.enum(["draft", "on_sale", "closed"]) }))
    .handler(async ({ input }) => {
      await db.update(events).set({ status: input.status }).where(eq(events.id, input.eventId));
      await writeAudit({
        actor: "human:organizer",
        action: "event.status",
        entityType: "event",
        entityId: input.eventId,
        detail: { status: input.status },
      });
      return { ok: true };
    }),

  /** Organizer + ops: sales and check-in per room. */
  performance: base.input(z.object({ eventId: z.string() })).handler(async ({ input }) => {
    const [row] = await db
      .select({ event: events, venue: venues })
      .from(events)
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(eq(events.id, input.eventId));
    if (!row) throw new ORPCError("NOT_FOUND", { message: "No such room" });

    const tiers = await db.select().from(ticketTiers).where(eq(ticketTiers.eventId, input.eventId));
    const eventTickets = await db.select().from(tickets).where(eq(tickets.eventId, input.eventId));

    const issued = eventTickets.filter((t) => t.status === "ISSUED" || t.status === "SCANNED");
    const scanned = eventTickets.filter((t) => t.status === "SCANNED");
    const revenue = issued.reduce((sum, t) => {
      const tier = tiers.find((x) => x.id === t.tierId);
      return sum + (tier?.priceMmk ?? 0);
    }, 0);

    return {
      eventId: row.event.id,
      name: row.event.name,
      venue: row.venue?.name ?? "—",
      status: row.event.status,
      capacity: row.event.capacity,
      issued: issued.length,
      inside: scanned.length,
      held: tiers.reduce((sum, t) => sum + t.sold, 0) - issued.length,
      revenueMmk: revenue,
      tiers: tiers.map((t) => ({
        id: t.id,
        name: t.name,
        priceMmk: t.priceMmk,
        capacity: t.capacity,
        held: t.sold,
        remaining: Math.max(0, t.capacity - t.sold),
      })),
    };
  }),
};
