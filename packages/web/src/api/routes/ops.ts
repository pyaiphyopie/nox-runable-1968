import { z } from "zod";
import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { db } from "../database";
import { agentTasks, auditLog, events, entryScans, orders, payments, ticketTiers, tickets } from "../database/schema";
import { newId } from "../lib/ids";
import { findViolations, REPAIR_MEANING, type RepairAction, type Violation } from "../lib/coherence";
import { issueTicketsForOrder, voidTicketsForOrder } from "../lib/credentials";
import { releaseInventory } from "../lib/inventory";
import { writeAudit } from "../lib/audit";

/**
 * The agent desk, wired to real rows. Each agent is a deterministic query over the
 * database that produces a task carrying the repair it proposes; applying the task
 * performs that repair and writes an audit entry. Nothing here is a simulation of
 * reasoning, and nothing acts without a task a human can read first.
 */

export interface AgentDescriptor {
  id: string;
  name: string;
  lane: "operate" | "research";
  policy: "read" | "suggest" | "execute";
  brief: string;
}

export const AGENTS: AgentDescriptor[] = [
  {
    id: "coherence",
    name: "Coherence",
    lane: "operate",
    policy: "execute",
    brief: "Payment, ticket and entry must agree. Raises a task per disagreement, with the repair attached.",
  },
  {
    id: "fraud",
    name: "Fraud",
    lane: "operate",
    policy: "execute",
    brief: "Reused mobile-money transaction IDs across orders, and proofs submitted against the wrong amount.",
  },
  {
    id: "inventory",
    name: "Inventory",
    lane: "operate",
    policy: "suggest",
    brief: "Holds past their window, tiers close to cap. Suggests; never releases inventory on its own.",
  },
  {
    id: "support",
    name: "Support",
    lane: "research",
    policy: "read",
    brief: "Orders stuck waiting on a human, and payers who submitted a proof nobody has looked at.",
  },
];

async function openTaskExists(agent: string, entityId: string, action: string) {
  const [row] = await db
    .select({ id: agentTasks.id })
    .from(agentTasks)
    .where(
      and(
        eq(agentTasks.agent, agent),
        eq(agentTasks.entityId, entityId),
        eq(agentTasks.action, action),
        eq(agentTasks.status, "open"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function raiseTask(input: {
  agent: string;
  title: string;
  detail: string;
  severity: "info" | "warn" | "critical";
  entityType: string;
  entityId: string;
  action: RepairAction | "";
  payload?: Record<string, unknown>;
}): Promise<boolean> {
  const descriptor = AGENTS.find((a) => a.id === input.agent)!;
  if (await openTaskExists(input.agent, input.entityId, input.action)) return false;
  await db.insert(agentTasks).values({
    id: newId("tsk"),
    agent: input.agent,
    lane: descriptor.lane,
    policy: descriptor.policy,
    title: input.title,
    detail: input.detail,
    severity: input.severity,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: JSON.stringify(input.payload ?? {}),
  });
  await writeAudit({
    actor: `agent:${input.agent}`,
    action: "task.raised",
    entityType: input.entityType,
    entityId: input.entityId,
    detail: { title: input.title, action: input.action, severity: input.severity },
  });
  return true;
}

export const ops = {
  /** Console header: numbers straight off the tables. */
  overview: base.handler(async () => {
    const orderRows = await db
      .select({ status: orders.status, n: sql<number>`count(*)` })
      .from(orders)
      .groupBy(orders.status);

    const [ticketRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(tickets)
      .where(inArray(tickets.status, ["ISSUED", "SCANNED"]));

    const [insideRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(tickets)
      .where(eq(tickets.status, "SCANNED"));

    const [verifiedRow] = await db
      .select({ amount: sql<number>`coalesce(sum(${orders.amountMmk}), 0)` })
      .from(orders)
      .where(eq(orders.status, "VERIFIED"));

    const [flaggedRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(payments)
      .where(ne(payments.flags, ""));

    const [openTasks] = await db
      .select({ n: sql<number>`count(*)` })
      .from(agentTasks)
      .where(eq(agentTasks.status, "open"));

    const violations = await findViolations();
    const byStatus = Object.fromEntries(orderRows.map((r) => [r.status, Number(r.n)]));

    return {
      orders: {
        total: orderRows.reduce((sum, r) => sum + Number(r.n), 0),
        awaiting: byStatus.AWAITING_PAYMENT ?? 0,
        submitted: byStatus.PROOF_SUBMITTED ?? 0,
        verified: byStatus.VERIFIED ?? 0,
        rejected: byStatus.REJECTED ?? 0,
        expired: byStatus.EXPIRED ?? 0,
      },
      ticketsIssued: Number(ticketRow?.n ?? 0),
      inside: Number(insideRow?.n ?? 0),
      verifiedValueMmk: Number(verifiedRow?.amount ?? 0),
      flaggedPayments: Number(flaggedRow?.n ?? 0),
      openTasks: Number(openTasks?.n ?? 0),
      violations: violations.length,
      criticalViolations: violations.filter((v) => v.severity === "critical").length,
      agents: AGENTS,
    };
  }),

  coherence: base
    .input(z.object({ eventId: z.string().optional() }).default({}))
    .handler(async ({ input }) => {
      const violations = await findViolations(input.eventId);
      return {
        checked: ["credential vs payment", "verified order vs credential", "hold vs clock", "entry vs credential", "tier vs cap"],
        violations,
        meanings: REPAIR_MEANING,
      };
    }),

  /**
   * Run every agent. Deterministic handlers over real rows; the same state always
   * yields the same tasks, and re-running never duplicates an open one.
   */
  runAgents: base.handler(async () => {
    const raised: Array<{ agent: string; title: string; action: string }> = [];
    const summary: Array<{ agent: string; scanned: number; raised: number; note: string }> = [];

    // Coherence
    const violations: Violation[] = await findViolations();
    let coherenceRaised = 0;
    for (const v of violations) {
      const ok = await raiseTask({
        agent: "coherence",
        title: v.title,
        detail: v.detail,
        severity: v.severity,
        entityType: v.entityType,
        entityId: v.entityId,
        action: v.action,
        payload: { code: v.code, eventId: v.eventId },
      });
      if (ok) {
        coherenceRaised++;
        raised.push({ agent: "coherence", title: v.title, action: v.action });
      }
    }
    summary.push({
      agent: "coherence",
      scanned: violations.length,
      raised: coherenceRaised,
      note: "payment · ticket · entry",
    });

    // Fraud — one mobile-money transaction ID must not back two orders.
    const dupes = await db
      .select({
        reference: payments.payerReference,
        n: sql<number>`count(distinct ${payments.orderId})`,
      })
      .from(payments)
      .where(and(ne(payments.payerReference, ""), sql`${payments.payerReference} is not null`))
      .groupBy(payments.payerReference)
      .having(gt(sql`count(distinct ${payments.orderId})`, 1));

    let fraudRaised = 0;
    for (const dupe of dupes) {
      const rows = await db
        .select({ payment: payments, order: orders })
        .from(payments)
        .leftJoin(orders, eq(orders.id, payments.orderId))
        .where(eq(payments.payerReference, dupe.reference ?? ""));
      for (const row of rows) {
        if (!row.order) continue;
        const live = await db
          .select({ id: tickets.id })
          .from(tickets)
          .where(and(eq(tickets.orderId, row.order.id), eq(tickets.status, "ISSUED")));
        const action: RepairAction = live.length ? "void_tickets" : "reconcile_payment";
        const ok = await raiseTask({
          agent: "fraud",
          title: `Reused transaction ID · ${dupe.reference}`,
          detail: `Transaction ${dupe.reference} appears on ${dupe.n} orders. This one is ${row.order.ref} (${row.order.status}) with ${live.length} live credential(s).`,
          severity: "critical",
          entityType: "order",
          entityId: row.order.id,
          action,
          payload: { reference: dupe.reference, orders: dupe.n },
        });
        if (ok) {
          fraudRaised++;
          raised.push({ agent: "fraud", title: `Reused transaction ID · ${dupe.reference}`, action });
        }
      }
    }
    summary.push({ agent: "fraud", scanned: dupes.length, raised: fraudRaised, note: "transaction IDs" });

    // Inventory — near-cap tiers, read-only suggestions.
    const hotTiers = await db
      .select({ id: tickets.tierId, eventId: tickets.eventId, n: sql<number>`count(*)` })
      .from(tickets)
      .where(inArray(tickets.status, ["ISSUED", "SCANNED"]))
      .groupBy(tickets.tierId, tickets.eventId);
    const tierRows = hotTiers.length
      ? await db.select().from(ticketTiers).where(inArray(ticketTiers.id, hotTiers.map((t) => t.id)))
      : [];
    let inventoryRaised = 0;
    for (const tier of hotTiers) {
      const row = tierRows.find((r) => r.id === tier.id);
      if (!row || row.capacity <= 0) continue;
      const fill = Number(tier.n) / row.capacity;
      if (fill >= 0.9) {
        const ok = await raiseTask({
          agent: "inventory",
          title: `${row.name} at ${Math.round(fill * 100)}% of cap`,
          detail: `${tier.n} of ${row.capacity} credentials issued. Room for ${Math.max(0, row.capacity - Number(tier.n))} more before the tier is a waitlist.`,
          severity: "info",
          entityType: "tier",
          entityId: tier.id,
          action: "",
          payload: { eventId: tier.eventId },
        });
        if (ok) inventoryRaised++;
      }
    }
    summary.push({ agent: "inventory", scanned: hotTiers.length, raised: inventoryRaised, note: "tier fill" });

    // Support — proofs nobody has looked at.
    const cutoff = new Date(Date.now() - 10 * 60_000);
    const stuck = await db
      .select({ id: orders.id, ref: orders.ref, updatedAt: orders.updatedAt, eventId: orders.eventId })
      .from(orders)
      .where(and(eq(orders.status, "PROOF_SUBMITTED"), sql`${orders.updatedAt} < ${Math.floor(cutoff.getTime() / 1000)}`));
    let supportRaised = 0;
    for (const order of stuck) {
      const ok = await raiseTask({
        agent: "support",
        title: `Proof waiting over 10 minutes · ${order.ref}`,
        detail: `Order ${order.ref} has been PROOF_SUBMITTED since ${order.updatedAt.toISOString().slice(11, 16)} UTC. The payer is holding a hold that will lapse.`,
        severity: "warn",
        entityType: "order",
        entityId: order.id,
        action: "",
        payload: { eventId: order.eventId },
      });
      if (ok) supportRaised++;
    }
    summary.push({ agent: "support", scanned: stuck.length, raised: supportRaised, note: "stuck proofs" });

    return { summary, raised, ranAt: new Date() };
  }),

  tasks: base
    .input(z.object({ status: z.enum(["open", "applied", "dismissed", "all"]).default("open") }))
    .handler(async ({ input }) => {
      const rows = await db
        .select()
        .from(agentTasks)
        .where(input.status === "all" ? undefined : eq(agentTasks.status, input.status))
        .orderBy(desc(agentTasks.createdAt))
        .limit(60);
      return rows.map((t) => ({
        id: t.id,
        agent: t.agent,
        lane: t.lane,
        policy: t.policy,
        title: t.title,
        detail: t.detail,
        severity: t.severity,
        status: t.status,
        entityType: t.entityType,
        entityId: t.entityId,
        action: t.action,
        meaning: t.action ? REPAIR_MEANING[t.action as RepairAction] : null,
        createdAt: t.createdAt,
        resolvedAt: t.resolvedAt,
        resolvedBy: t.resolvedBy,
      }));
    }),

  /** Apply the repair a task proposes. Real rows change here, and it is audited. */
  applyTask: base.input(z.object({ taskId: z.string() })).handler(async ({ input }) => {
    const [task] = await db.select().from(agentTasks).where(eq(agentTasks.id, input.taskId));
    if (!task) throw new ORPCError("NOT_FOUND", { message: "No such task" });
    if (task.status !== "open") throw new ORPCError("CONFLICT", { message: `Task is ${task.status}` });
    if (!task.action) throw new ORPCError("CONFLICT", { message: "This task is advisory — nothing to apply" });

    const action = task.action as RepairAction;
    let outcome = "";

    if (action === "void_tickets") {
      const [order] = await db.select().from(orders).where(eq(orders.id, task.entityId));
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Order is gone" });
      const voided = await voidTicketsForOrder(order.id, "agent:coherence", task.title);
      await releaseInventory(order.tierId, order.qty);
      outcome = `Voided ${voided} credential(s), released ${order.qty} to the tier. Money still needs a human refund review.`;
    } else if (action === "issue_tickets") {
      const result = await issueTicketsForOrder(task.entityId, "agent:coherence");
      outcome = `Issued ${result.issued} credential(s).`;
    } else if (action === "expire_order") {
      const [order] = await db.select().from(orders).where(eq(orders.id, task.entityId));
      if (order && order.status !== "EXPIRED" && order.status !== "VERIFIED") {
        await db.update(orders).set({ status: "EXPIRED", updatedAt: new Date() }).where(eq(orders.id, order.id));
        await releaseInventory(order.tierId, order.qty);
        outcome = `Expired ${order.ref} and released ${order.qty} to the tier.`;
      } else {
        outcome = "Order was already closed; nothing released.";
      }
    } else if (action === "flag_scan") {
      const [scan] = await db.select().from(entryScans).where(eq(entryScans.id, task.entityId));
      if (!scan) throw new ORPCError("NOT_FOUND", { message: "Scan is gone" });
      await db
        .update(entryScans)
        .set({ reason: `FLAGGED · ${scan.reason}` })
        .where(eq(entryScans.id, scan.id));
      outcome = `Door record flagged; original reason kept.`;
    } else if (action === "reconcile_payment") {
      const [order] = await db.select().from(orders).where(eq(orders.id, task.entityId));
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Order is gone" });
      await db.update(orders).set({ status: "PROOF_SUBMITTED", updatedAt: new Date() }).where(eq(orders.id, order.id));
      await db.update(payments).set({ status: "SUBMITTED" }).where(eq(payments.orderId, order.id));
      outcome = `Returned ${order.ref} to the verification queue.`;
    }

    await db
      .update(agentTasks)
      .set({ status: "applied", resolvedAt: new Date(), resolvedBy: "human:ops" })
      .where(eq(agentTasks.id, task.id));

    await writeAudit({
      actor: "human:ops",
      action: `repair.${action}`,
      entityType: task.entityType,
      entityId: task.entityId,
      detail: { taskId: task.id, title: task.title, outcome },
    });

    return { ok: true, action, outcome };
  }),

  dismissTask: base
    .input(z.object({ taskId: z.string(), note: z.string().default("dismissed by ops") }))
    .handler(async ({ input }) => {
      await db
        .update(agentTasks)
        .set({ status: "dismissed", resolvedAt: new Date(), resolvedBy: "human:ops" })
        .where(eq(agentTasks.id, input.taskId));
      await writeAudit({
        actor: "human:ops",
        action: "task.dismissed",
        entityType: "agent_task",
        entityId: input.taskId,
        detail: { note: input.note },
      });
      return { ok: true };
    }),

  /** Append-only trail. This is the answer to "why did this ticket work?". */
  audit: base.input(z.object({ limit: z.number().int().min(1).max(200).default(40) })).handler(async ({ input }) => {
    const rows = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(input.limit);
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      actor: r.actor,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      detail: JSON.parse(r.detail) as Record<string, unknown>,
    }));
  }),

  /** Every room's live position, for the ops rail. */
  rooms: base.handler(async () => {
    const rows = await db.select().from(events).orderBy(desc(events.doorsAt));
    const out = [];
    for (const event of rows) {
      const [issued] = await db
        .select({ n: sql<number>`count(*)` })
        .from(tickets)
        .where(and(eq(tickets.eventId, event.id), inArray(tickets.status, ["ISSUED", "SCANNED"])));
      const [inside] = await db
        .select({ n: sql<number>`count(*)` })
        .from(tickets)
        .where(and(eq(tickets.eventId, event.id), eq(tickets.status, "SCANNED")));
      const [rejected] = await db
        .select({ n: sql<number>`count(*)` })
        .from(entryScans)
        .where(and(eq(entryScans.eventId, event.id), eq(entryScans.result, "REJECTED")));
      out.push({
        id: event.id,
        name: event.name,
        status: event.status,
        capacity: event.capacity,
        issued: Number(issued?.n ?? 0),
        inside: Number(inside?.n ?? 0),
        rejectedScans: Number(rejected?.n ?? 0),
      });
    }
    return out;
  }),
};
