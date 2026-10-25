/**
 * Payment adapter seam. Phase 1 (per the NOX blueprint) is manual verification against
 * mobile-money receipts — no PSP licensing, no live wallet API. Each adapter below
 * describes how a payer is told to move money and what the verifier needs back.
 *
 * To go live, replace `submitProof`/`verify` handling with a PSP webhook (2C2P, Wave
 * partner program, Connected Group gateway) inside this file. Nothing outside it
 * assumes a manual flow except the copy and the reference field.
 */

export interface PaymentAdapter {
  id: string;
  label: string;
  /** Shown as the payee line the payer must match in their wallet app. */
  payee: string;
  payeeAccount: string;
  /** Deep-link / app scheme label. Labelled as a hand-off, never claimed as a live call. */
  handoff: string;
  /** What the payer copies back out of their wallet after paying. */
  referenceLabel: string;
  accent: string;
}

export const PAYMENT_ADAPTERS: PaymentAdapter[] = [
  {
    id: "KBZPAY",
    label: "KBZPay",
    payee: "NOX Ticketing",
    payeeAccount: "09 750 118 204",
    handoff: "KBZPay app · Transfer to wallet",
    referenceLabel: "KBZPay transaction ID",
    accent: "#D9A35C",
  },
  {
    id: "WAVEPAY",
    label: "WavePay",
    payee: "NOX Ticketing",
    payeeAccount: "09 972 440 156",
    handoff: "WavePay app · Send money",
    referenceLabel: "WavePay transaction ID",
    accent: "#8E72F2",
  },
  {
    id: "AYAPAY",
    label: "AyaPay",
    payee: "NOX Ticketing",
    payeeAccount: "09 421 887 330",
    handoff: "AyaPay app · Transfer",
    referenceLabel: "AyaPay reference",
    accent: "#6FBF8B",
  },
  {
    id: "CBPAY",
    label: "CBPay",
    payee: "NOX Ticketing",
    payeeAccount: "09 250 664 719",
    handoff: "CBPay app · Transfer",
    referenceLabel: "CBPay reference",
    accent: "#E2645A",
  },
];

export const PAYMENT_PROVIDER_IDS = PAYMENT_ADAPTERS.map((a) => a.id);

export function adapterFor(id: string): PaymentAdapter {
  const found = PAYMENT_ADAPTERS.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown payment adapter: ${id}`);
  return found;
}

/** Verifier checklist — what a human is actually confirming when they approve. */
export const VERIFICATION_CHECKLIST = [
  "Amount on the receipt matches the order total exactly.",
  "Payee account on the receipt matches the NOX wallet above.",
  "Transaction ID has not been used on another order.",
  "Timestamp falls inside the order's payment window.",
];
