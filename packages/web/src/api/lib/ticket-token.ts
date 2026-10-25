import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ticket credentials are signed, not stored as guessable ids, so a door device can
 * prove a token was issued by this server without trusting the client. The ticket
 * row remains the source of truth — a valid signature is necessary, never sufficient.
 */
const SECRET =
  process.env.TICKET_SIGNING_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "nox-dev-only-secret";

export interface TicketPayload {
  /** ticket id */
  t: string;
  /** event id */
  e: string;
  /** order ref, for the door operator's eyes */
  r: string;
  /** nonce, so two tickets on one order never share a token */
  n: string;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("base64url");
}

export function signTicket(payload: TicketPayload): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export type VerifyResult =
  | { ok: true; payload: TicketPayload }
  | { ok: false; reason: string };

export function verifyTicket(token: string): VerifyResult {
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "MALFORMED" };

  const body = trimmed.slice(0, dot);
  const provided = trimmed.slice(dot + 1);
  const expected = sign(body);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "BAD_SIGNATURE" };

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TicketPayload;
    if (!payload?.t || !payload?.e) return { ok: false, reason: "MALFORMED" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
}

/** The QR image the consumer shows at the door, rendered server-side as SVG. */
export async function qrSvg(text: string): Promise<string> {
  const { toString } = await import("qrcode");
  return toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0A0A0D", light: "#ECEAE6" },
  });
}
