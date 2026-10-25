import { eq } from "drizzle-orm";
import { db } from "../database";
import {
  agentTasks,
  analyticsEvents,
  auditLog,
  entryScans,
  events,
  orders,
  payments,
  ticketTiers,
  tickets,
  users,
  venues,
} from "../database/schema";
import { signTicket } from "./ticket-token";
import { nonce } from "./ids";

/**
 * Demo data for a Yangon night. This is the only place where inconsistency is
 * deliberate: two orders are seeded in states that break the payment/ticket/entry
 * invariant, and one transaction ID is reused across two orders. They are here so the
 * coherence and fraud agents have something real to catch — the detection itself is
 * the same code path used on live rows, and the seed summary says so out loud.
 */

const AURA = "evt_aura";
const KINETIC = "evt_kinetic";
const BLACKROOM = "evt_blackroom";
const MONSOON = "evt_monsoon";

const HOUR = 3600_000;

function tonight(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

export interface SeedSummary {
  rooms: number;
  tiers: number;
  orders: number;
  tickets: number;
  scans: number;
  planted: string[];
}

export async function seedDemo(): Promise<SeedSummary> {
  await wipeDemo();

  // People
  await db.insert(users).values([
    { id: "usr_consumer", name: "Jake Pierre", phone: "09750118204", role: "consumer" },
    { id: "usr_organizer", name: "Pierre Computer Company", phone: "09750118205", role: "organizer" },
    { id: "usr_door", name: "Door · AURA", phone: "09750118206", role: "door" },
    { id: "usr_ops", name: "NOX Ops", phone: "09750118207", role: "ops" },
  ]);

  await db.insert(venues).values([
    { id: "ven_aura", name: "AURA", area: "Bahan", capacity: 280 },
    { id: "ven_kinetic", name: "KINETIC", area: "Downtown", capacity: 420 },
    { id: "ven_blackroom", name: "BLACKROOM", area: "Kyauktada", capacity: 140 },
    { id: "ven_monsoon", name: "MONSOON", area: "Kandawgyi", capacity: 200 },
  ]);

  await db.insert(events).values([
    {
      id: AURA,
      venueId: "ven_aura",
      name: "AURA // After Dark",
      genre: "Techno",
      area: "Bahan",
      blurb: "Resident techno. Low light, tight room, no guest-list theatre.",
      lineup: "Mira V. · Ko Sett · Night Operator",
      doorsAt: tonight(21, 30),
      endsAt: tonight(28, 0),
      capacity: 280,
      artKey: "a",
      status: "on_sale",
    },
    {
      id: KINETIC,
      venueId: "ven_kinetic",
      name: "Kinetic Friday",
      genre: "House",
      area: "Downtown",
      blurb: "Main room house. Fast entry lane after 23:00.",
      lineup: "Linn · House Committee",
      doorsAt: tonight(22, 0),
      endsAt: tonight(27, 0),
      capacity: 420,
      artKey: "b",
      status: "on_sale",
    },
    {
      id: BLACKROOM,
      venueId: "ven_blackroom",
      name: "Blackroom Resident",
      genre: "Underground",
      area: "Kyauktada",
      blurb: "Small room. Capacity is the product.",
      lineup: "S. Rao · Closed Circle",
      doorsAt: tonight(23, 30),
      endsAt: tonight(29, 0),
      capacity: 140,
      artKey: "c",
      status: "on_sale",
    },
    {
      id: MONSOON,
      venueId: "ven_monsoon",
      name: "Monsoon Sessions",
      genre: "Live + electronic",
      area: "Kandawgyi",
      blurb: "Early set, rooftop then room. Quieter close.",
      lineup: "Aye String Quartet · Dock Signal",
      doorsAt: tonight(20, 30),
      endsAt: tonight(25, 0),
      capacity: 200,
      artKey: "d",
      status: "on_sale",
    },
  ]);

  await db.insert(ticketTiers).values([
    { id: "tier_aura_early", eventId: AURA, name: "Early", priceMmk: 15000, capacity: 120, sortOrder: 0 },
    { id: "tier_aura_door", eventId: AURA, name: "Door", priceMmk: 25000, capacity: 140, sortOrder: 1 },
    { id: "tier_aura_table", eventId: AURA, name: "Table hold", priceMmk: 180000, capacity: 8, sortOrder: 2 },
    { id: "tier_kin_early", eventId: KINETIC, name: "Early", priceMmk: 12000, capacity: 200, sortOrder: 0 },
    { id: "tier_kin_door", eventId: KINETIC, name: "Door", priceMmk: 20000, capacity: 180, sortOrder: 1 },
    { id: "tier_blk_door", eventId: BLACKROOM, name: "Door", priceMmk: 18000, capacity: 140, sortOrder: 0 },
    { id: "tier_mon_session", eventId: MONSOON, name: "Session", priceMmk: 20000, capacity: 200, sortOrder: 0 },
  ]);

  // --- Orders ---------------------------------------------------------------

  // 1. Clean sale: verified, two credentials issued, one already used at the door.
  await db.insert(orders).values({
    id: "ord_verified",
    ref: "NX-4K7Q",
    userId: "usr_consumer",
    eventId: AURA,
    tierId: "tier_aura_early",
    qty: 2,
    amountMmk: 30000,
    status: "VERIFIED",
    holdExpiresAt: new Date(Date.now() + 4 * HOUR),
    idempotencyKey: "seed-verified",
    note: "Seed: clean verified sale",
  });
  await db.insert(payments).values({
    id: "pay_verified",
    orderId: "ord_verified",
    provider: "KBZPAY",
    amountMmk: 30000,
    payerReference: "KBZ-7712093",
    payerPhone: "09750118204",
    status: "VERIFIED",
    verifiedBy: "ops",
    verifiedAt: new Date(Date.now() - 2 * HOUR),
  });
  const t1 = signTicket({ t: "tkt_verified_1", e: AURA, r: "NX-4K7Q", n: nonce() });
  const t2 = signTicket({ t: "tkt_verified_2", e: AURA, r: "NX-4K7Q", n: nonce() });
  await db.insert(tickets).values([
    {
      id: "tkt_verified_1",
      orderId: "ord_verified",
      eventId: AURA,
      tierId: "tier_aura_early",
      holderId: "usr_consumer",
      seq: 1,
      token: t1,
      status: "SCANNED",
      issuedAt: new Date(Date.now() - 2 * HOUR),
      scannedAt: new Date(Date.now() - 90 * 60_000),
    },
    {
      id: "tkt_verified_2",
      orderId: "ord_verified",
      eventId: AURA,
      tierId: "tier_aura_early",
      holderId: "usr_consumer",
      seq: 2,
      token: t2,
      status: "ISSUED",
      issuedAt: new Date(Date.now() - 2 * HOUR),
    },
  ]);

  // 2. Waiting on a human: proof submitted, nothing issued yet.
  await db.insert(orders).values({
    id: "ord_pending",
    ref: "NX-8B2M",
    userId: "usr_consumer",
    eventId: AURA,
    tierId: "tier_aura_door",
    qty: 1,
    amountMmk: 25000,
    status: "PROOF_SUBMITTED",
    holdExpiresAt: new Date(Date.now() + 18 * 60_000),
    idempotencyKey: "seed-pending",
    note: "Seed: awaiting verification",
  });
  await db.insert(payments).values({
    id: "pay_pending",
    orderId: "ord_pending",
    provider: "WAVEPAY",
    amountMmk: 25000,
    payerReference: "WAVE-5510228",
    payerPhone: "09750118204",
    status: "SUBMITTED",
  });

  // 3. Planted inconsistency A: payment rejected, credentials still live.
  await db.insert(orders).values({
    id: "ord_rejected_live",
    ref: "NX-2D9F",
    userId: "usr_consumer",
    eventId: BLACKROOM,
    tierId: "tier_blk_door",
    qty: 1,
    amountMmk: 18000,
    status: "REJECTED",
    holdExpiresAt: new Date(Date.now() + 3 * HOUR),
    idempotencyKey: "seed-rejected-live",
    note: "Seed: planted — rejected payment with a live credential",
  });
  await db.insert(payments).values({
    id: "pay_rejected",
    orderId: "ord_rejected_live",
    provider: "AYAPAY",
    amountMmk: 18000,
    payerReference: "AYA-3390117",
    status: "REJECTED",
    reason: "Receipt amount did not match the order total.",
    verifiedBy: "ops",
    verifiedAt: new Date(Date.now() - 40 * 60_000),
  });
  await db.insert(tickets).values({
    id: "tkt_rejected_live",
    orderId: "ord_rejected_live",
    eventId: BLACKROOM,
    tierId: "tier_blk_door",
    holderId: "usr_consumer",
    seq: 1,
    token: signTicket({ t: "tkt_rejected_live", e: BLACKROOM, r: "NX-2D9F", n: nonce() }),
    status: "ISSUED",
    issuedAt: new Date(Date.now() - 45 * 60_000),
  });

  // 4. Planted inconsistency B: verified money with nothing issued against it.
  await db.insert(orders).values({
    id: "ord_paid_nothing",
    ref: "NX-6T3H",
    userId: "usr_consumer",
    eventId: MONSOON,
    tierId: "tier_mon_session",
    qty: 1,
    amountMmk: 20000,
    status: "VERIFIED",
    holdExpiresAt: new Date(Date.now() + 3 * HOUR),
    idempotencyKey: "seed-paid-nothing",
    note: "Seed: planted — verified payment with no credential",
  });
  await db.insert(payments).values({
    id: "pay_paid_nothing",
    orderId: "ord_paid_nothing",
    provider: "CBPAY",
    amountMmk: 20000,
    payerReference: "CBP-9022114",
    status: "VERIFIED",
    verifiedBy: "ops",
    verifiedAt: new Date(Date.now() - 25 * 60_000),
  });

  // 5. Planted inconsistency C: the same transaction ID backing two orders.
  await db.insert(orders).values({
    id: "ord_dupe_ref",
    ref: "NX-5W1K",
    userId: "usr_consumer",
    eventId: KINETIC,
    tierId: "tier_kin_door",
    qty: 1,
    amountMmk: 20000,
    status: "PROOF_SUBMITTED",
    holdExpiresAt: new Date(Date.now() + 15 * 60_000),
    idempotencyKey: "seed-dupe-ref",
    note: "Seed: planted — reused transaction ID",
  });
  await db.insert(payments).values({
    id: "pay_dupe_ref",
    orderId: "ord_dupe_ref",
    provider: "KBZPAY",
    amountMmk: 20000,
    payerReference: "KBZ-7712093",
    payerPhone: "09750118204",
    status: "SUBMITTED",
    flags: "DUPLICATE_REFERENCE",
  });

  // Inventory: everything open or verified counts as held.
  const heldByTier: Record<string, number> = {
    tier_aura_early: 2,
    tier_aura_door: 1,
    tier_blk_door: 1,
    tier_mon_session: 1,
    tier_kin_door: 1,
  };
  for (const [tierId, held] of Object.entries(heldByTier)) {
    await db.update(ticketTiers).set({ sold: held }).where(eq(ticketTiers.id, tierId));
  }

  // Door records: one clean accept, one repeat attempt on the same credential.
  await db.insert(entryScans).values([
    {
      id: "scn_seed_1",
      ticketId: "tkt_verified_1",
      eventId: AURA,
      tokenInput: t1.slice(0, 12),
      result: "ACCEPTED",
      reason: "OK",
      scannedBy: "door",
      device: "web",
      at: new Date(Date.now() - 90 * 60_000),
    },
    {
      id: "scn_seed_2",
      ticketId: "tkt_verified_1",
      eventId: AURA,
      tokenInput: t1.slice(0, 12),
      result: "REJECTED",
      reason: "ALREADY_USED",
      scannedBy: "door",
      device: "web",
      at: new Date(Date.now() - 88 * 60_000),
    },
  ]);

  await db.insert(auditLog).values([
    {
      id: "aud_seed_1",
      actor: "human:usr_consumer",
      action: "order.created",
      entityType: "order",
      entityId: "ord_verified",
      detail: JSON.stringify({ tier: "Early", qty: 2, amountMmk: 30000, provider: "KBZPAY" }),
    },
    {
      id: "aud_seed_2",
      actor: "human:ops",
      action: "payment.verified",
      entityType: "order",
      entityId: "ord_verified",
      detail: JSON.stringify({ ref: "NX-4K7Q", reference: "KBZ-7712093" }),
    },
    {
      id: "aud_seed_3",
      actor: "human:ops",
      action: "payment.rejected",
      entityType: "order",
      entityId: "ord_rejected_live",
      detail: JSON.stringify({ ref: "NX-2D9F", reason: "Receipt amount did not match the order total." }),
    },
    {
      id: "aud_seed_4",
      actor: "human:door",
      action: "ticket.scanned",
      entityType: "ticket",
      entityId: "tkt_verified_1",
      detail: JSON.stringify({ orderRef: "NX-4K7Q", device: "web" }),
    },
  ]);

  await db.insert(analyticsEvents).values([
    { id: "an_seed_1", name: "room.viewed", userId: "usr_consumer", eventId: AURA, props: "{}" },
    { id: "an_seed_2", name: "room.viewed", userId: "usr_consumer", eventId: KINETIC, props: "{}" },
    { id: "an_seed_3", name: "room.viewed", userId: "usr_consumer", eventId: BLACKROOM, props: "{}" },
    { id: "an_seed_4", name: "checkout.started", userId: "usr_consumer", eventId: AURA, props: '{"amountMmk":30000}' },
    { id: "an_seed_5", name: "checkout.started", userId: "usr_consumer", eventId: BLACKROOM, props: '{"amountMmk":18000}' },
    { id: "an_seed_6", name: "payment.proof_submitted", userId: "usr_consumer", eventId: AURA, props: "{}" },
    { id: "an_seed_7", name: "payment.verified", userId: "usr_consumer", eventId: AURA, props: '{"issued":2}' },
    { id: "an_seed_8", name: "entry.scanned", userId: "usr_consumer", eventId: AURA, props: '{"result":"ACCEPTED"}' },
  ]);

  return {
    rooms: 4,
    tiers: 7,
    orders: 5,
    tickets: 3,
    scans: 2,
    planted: [
      "NX-2D9F · rejected payment with a live credential",
      "NX-6T3H · verified payment with no credential",
      "NX-5W1K · transaction ID KBZ-7712093 reused from NX-4K7Q",
    ],
  };
}

export async function wipeDemo(): Promise<void> {
  await db.delete(agentTasks);
  await db.delete(entryScans);
  await db.delete(tickets);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(ticketTiers);
  await db.delete(events);
  await db.delete(venues);
  await db.delete(auditLog);
  await db.delete(analyticsEvents);
  await db.delete(users);
}
