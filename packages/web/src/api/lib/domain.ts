/** Domain vocabulary shared by the API and both clients. Money is integer MMK, never float. */

export const ORDER_STATES = [
  "AWAITING_PAYMENT",
  "PROOF_SUBMITTED",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
] as const;
export type OrderStatus = (typeof ORDER_STATES)[number];

export const TICKET_STATES = ["RESERVED", "ISSUED", "SCANNED", "VOID"] as const;
export type TicketStatus = (typeof TICKET_STATES)[number];

export const PAYMENT_STATES = [
  "AWAITING_PAYMENT",
  "SUBMITTED",
  "VERIFIED",
  "REJECTED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATES)[number];

/** How long inventory stays held while a payer is off in their wallet app. */
export const HOLD_MINUTES = 20;

/** The only legal order transitions. Anything else is a bug, and is rejected. */
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  AWAITING_PAYMENT: ["PROOF_SUBMITTED", "EXPIRED"],
  PROOF_SUBMITTED: ["VERIFIED", "REJECTED", "EXPIRED"],
  VERIFIED: [],
  REJECTED: ["PROOF_SUBMITTED"],
  EXPIRED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isOpenOrder(status: OrderStatus): boolean {
  return status === "AWAITING_PAYMENT" || status === "PROOF_SUBMITTED";
}

export function mmk(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(Math.round(amount))} MMK`;
}

/** Yangon is UTC+6:30 with no DST — computed rather than configured. */
const MMT_OFFSET_MIN = 6 * 60 + 30;

export function mmtTime(date: Date): string {
  const shifted = new Date(date.getTime() + MMT_OFFSET_MIN * 60_000);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

export function mmtClock(date: Date): string {
  const shifted = new Date(date.getTime() + MMT_OFFSET_MIN * 60_000);
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const m = String(shifted.getUTCMinutes()).padStart(2, "0");
  const s = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function mmtWindow(doorsAt: Date, endsAt: Date): string {
  return `${mmtTime(doorsAt)}–${mmtTime(endsAt)} MMT`;
}

export function holdsUntil(now: Date): Date {
  return new Date(now.getTime() + HOLD_MINUTES * 60_000);
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}
