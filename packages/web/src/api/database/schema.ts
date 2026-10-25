import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

const now = () => new Date();

/** People. One table, role-scoped: consumer, organizer, door, ops. */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    role: text("role").notNull().default("consumer"), // consumer | organizer | door | ops
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("users_phone_idx").on(t.phone)],
);

/** Organizer / promoter accounts. */
export const promoters = sqliteTable("promoters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

/** Physical rooms. */
export const venues = sqliteTable("venues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  area: text("area").notNull(),
  capacity: integer("capacity").notNull(),
  promoterId: text("promoter_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    venueId: text("venue_id").notNull(),
    promoterId: text("promoter_id"),
    name: text("name").notNull(),
    genre: text("genre").notNull(),
    area: text("area").notNull(),
    blurb: text("blurb").notNull().default(""),
    lineup: text("lineup").notNull().default(""), // " · " separated
    doorsAt: integer("doors_at", { mode: "timestamp" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp" }).notNull(),
    capacity: integer("capacity").notNull(),
    artKey: text("art_key").notNull().default("a"),
    status: text("status").notNull().default("on_sale"), // draft | on_sale | closed
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  },
  (t) => [index("events_venue_idx").on(t.venueId)],
);

/** Price point + inventory cap. `sold` is held inventory, released when a hold expires. */
export const ticketTiers = sqliteTable(
  "ticket_tiers",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    name: text("name").notNull(),
    priceMmk: integer("price_mmk").notNull(),
    capacity: integer("capacity").notNull(),
    sold: integer("sold").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("open"), // open | closed
  },
  (t) => [index("tiers_event_idx").on(t.eventId)],
);

/**
 * A purchase. Server holds the state machine; the client never sets a state directly.
 * AWAITING_PAYMENT → PROOF_SUBMITTED → VERIFIED | REJECTED, or → EXPIRED when the hold lapses.
 */
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    ref: text("ref").notNull(),
    userId: text("user_id").notNull(),
    eventId: text("event_id").notNull(),
    tierId: text("tier_id").notNull(),
    qty: integer("qty").notNull().default(1),
    amountMmk: integer("amount_mmk").notNull(),
    status: text("status").notNull().default("AWAITING_PAYMENT"),
    holdExpiresAt: integer("hold_expires_at", { mode: "timestamp" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("orders_ref_idx").on(t.ref),
    uniqueIndex("orders_idem_idx").on(t.idempotencyKey),
    index("orders_event_idx").on(t.eventId),
  ],
);

/** Manual mobile-money verification. No live PSP calls — proof in, human verdict out. */
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    provider: text("provider").notNull(), // KBZPAY | WAVEPAY | AYAPAY | CBPAY
    flow: text("flow").notNull().default("deep_link_manual"),
    amountMmk: integer("amount_mmk").notNull(),
    payerReference: text("payer_reference"), // transaction id typed by the payer
    payerPhone: text("payer_phone"),
    receiptUrl: text("receipt_url"),
    status: text("status").notNull().default("AWAITING_PAYMENT"), // AWAITING_PAYMENT | SUBMITTED | VERIFIED | REJECTED
    verifiedBy: text("verified_by"),
    verifiedAt: integer("verified_at", { mode: "timestamp" }),
    reason: text("reason"),
    flags: text("flags").notNull().default(""), // comma separated fraud / duplicate flags
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    index("payments_status_idx").on(t.status),
    index("payments_reference_idx").on(t.payerReference),
  ],
);

/** Single-use credential. `token` is signed; the QR is rendered from it. */
export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    eventId: text("event_id").notNull(),
    tierId: text("tier_id").notNull(),
    holderId: text("holder_id").notNull(),
    seq: integer("seq").notNull().default(1),
    token: text("token").notNull(),
    status: text("status").notNull().default("RESERVED"), // RESERVED | ISSUED | SCANNED | VOID
    issuedAt: integer("issued_at", { mode: "timestamp" }),
    scannedAt: integer("scanned_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("tickets_token_idx").on(t.token),
    index("tickets_event_idx").on(t.eventId),
    index("tickets_order_idx").on(t.orderId),
  ],
);

/** Every door attempt, accepted or not. The door's own record, not the ticket's. */
export const entryScans = sqliteTable(
  "entry_scans",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id"),
    eventId: text("event_id"),
    tokenInput: text("token_input").notNull().default(""),
    result: text("result").notNull(), // ACCEPTED | REJECTED
    reason: text("reason").notNull().default(""),
    scannedBy: text("scanned_by").notNull().default("door"),
    device: text("device").notNull().default("web"),
    at: integer("at", { mode: "timestamp" }).notNull().$defaultFn(now),
  },
  (t) => [index("scans_event_idx").on(t.eventId), index("scans_at_idx").on(t.at)],
);

/** Append-only. Every state transition writes here; nothing mutates it. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: integer("at", { mode: "timestamp" }).notNull().$defaultFn(now),
    actor: text("actor").notNull(), // human:<id> | agent:<name> | system
    action: text("action").notNull(), // order.created, payment.verified, ticket.scanned ...
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detail: text("detail").notNull().default("{}"),
  },
  (t) => [index("audit_at_idx").on(t.at), index("audit_entity_idx").on(t.entityType, t.entityId)],
);

/** What an agent found, on real rows, with the repair it proposes. */
export const agentTasks = sqliteTable(
  "agent_tasks",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(), // coherence | inventory | fraud | support
    lane: text("lane").notNull(), // operate | research
    policy: text("policy").notNull(), // read | suggest | execute
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    severity: text("severity").notNull().default("info"), // info | warn | critical
    status: text("status").notNull().default("open"), // open | applied | dismissed
    entityType: text("entity_type").notNull().default("order"),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull().default(""), // repair verb the console can apply
    payload: text("payload").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
    resolvedBy: text("resolved_by"),
  },
  (t) => [index("tasks_status_idx").on(t.status), index("tasks_agent_idx").on(t.agent)],
);

/** Raw interaction stream (funnel source). */
export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    at: integer("at", { mode: "timestamp" }).notNull().$defaultFn(now),
    name: text("name").notNull(),
    userId: text("user_id"),
    eventId: text("event_id"),
    props: text("props").notNull().default("{}"),
  },
  (t) => [index("analytics_name_idx").on(t.name)],
);

export type User = typeof users.$inferSelect;
export type Event = typeof events.$inferSelect;
export type TicketTier = typeof ticketTiers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type EntryScan = typeof entryScans.$inferSelect;
export type AgentTask = typeof agentTasks.$inferSelect;
