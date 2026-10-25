import { randomUUID } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O

/** Prefixed, sortable-ish opaque id: usr_9f2k3m1p. */
export function newId(prefix: string): string {
  const bytes = randomUUID().replace(/-/g, "");
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += ALPHABET[parseInt(bytes.slice(i * 2, i * 2 + 2), 16) % ALPHABET.length];
  }
  return `${prefix}_${out.toLowerCase()}`;
}

/** Human-facing order reference shown in the app and typed into the door. NX-4K7Q. */
export function orderRef(): string {
  const bytes = randomUUID().replace(/-/g, "");
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[parseInt(bytes.slice(i * 2, i * 2 + 2), 16) % ALPHABET.length];
  }
  return `NX-${out}`;
}

/** Short token nonce used in the signed ticket payload. */
export function nonce(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}
