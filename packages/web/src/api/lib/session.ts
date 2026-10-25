import { eq } from "drizzle-orm";
import { db } from "../database";
import { users } from "../database/schema";
import { newId } from "./ids";

/**
 * Phase 1 identity stub. The blueprint puts OTP/OAuth (Supabase Auth) in the MVP, but
 * the app is built and reviewed without accounts, so each surface resolves a role
 * holder instead of a signed-in user. Swap this file for real auth middleware; nothing
 * downstream reads identity from anywhere else.
 */
const DEFAULT_NAMES: Record<string, string> = {
  consumer: "Jake Pierre",
  organizer: "Pierre Computer Company",
  door: "Door · AURA",
  ops: "NOX Ops",
};

export async function userForRole(role: string): Promise<string> {
  const [existing] = await db.select().from(users).where(eq(users.role, role)).limit(1);
  if (existing) return existing.id;

  const id = newId("usr");
  await db.insert(users).values({
    id,
    name: DEFAULT_NAMES[role] ?? role,
    phone: `09${Math.floor(100000000 + Math.random() * 899999999)}`,
    role,
  });
  return id;
}

export async function userName(userId: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user?.name ?? "Unknown";
}
