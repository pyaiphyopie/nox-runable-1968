import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { base } from "../__core/app";
import { db } from "../database";
import { analyticsEvents } from "../database/schema";
import { track } from "../lib/audit";

/** The funnel, counted from the raw stream rather than stored as a number. */
const FUNNEL = [
  { name: "room.viewed", label: "Viewed a room" },
  { name: "checkout.started", label: "Started checkout" },
  { name: "payment.proof_submitted", label: "Submitted a proof" },
  { name: "payment.verified", label: "Payment verified" },
  { name: "entry.scanned", label: "Reached the door" },
] as const;

export const analytics = {
  /** Client-side events (screen opens) land here; server-side ones are already written. */
  track: base
    .input(
      z.object({
        name: z.string().min(2),
        eventId: z.string().optional(),
        props: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .handler(async ({ input }) => {
      await track(input.name, { eventId: input.eventId, ...input.props });
      return { ok: true };
    }),

  funnel: base.input(z.object({ eventId: z.string().optional() }).default({})).handler(async ({ input }) => {
    const rows = await db
      .select({ name: analyticsEvents.name, n: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(input.eventId ? eq(analyticsEvents.eventId, input.eventId) : undefined)
      .groupBy(analyticsEvents.name);

    const counts = new Map(rows.map((r) => [r.name, Number(r.n)]));
    const steps = FUNNEL.map((step, i) => {
      const count = counts.get(step.name) ?? 0;
      const prev = i === 0 ? count : (counts.get(FUNNEL[i - 1].name) ?? 0);
      return {
        name: step.name,
        label: step.label,
        count,
        conversionFromPrevious: prev > 0 ? Math.round((count / prev) * 100) : null,
      };
    });

    return { steps, totalEvents: rows.reduce((sum, r) => sum + Number(r.n), 0) };
  }),

  recent: base.input(z.object({ limit: z.number().int().min(1).max(80).default(25) })).handler(async ({ input }) => {
    const rows = await db
      .select()
      .from(analyticsEvents)
      .orderBy(desc(analyticsEvents.at))
      .limit(input.limit);
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      name: r.name,
      eventId: r.eventId,
      props: JSON.parse(r.props) as Record<string, unknown>,
    }));
  }),
};
