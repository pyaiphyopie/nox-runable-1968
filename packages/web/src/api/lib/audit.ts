import { db } from "../database";
import { auditLog, analyticsEvents } from "../database/schema";
import { newId } from "./ids";

export type Actor = `human:${string}` | `agent:${string}` | "system";

/** Append-only record of every transition that matters. Nothing ever updates this table. */
export async function writeAudit(entry: {
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLog).values({
    id: newId("aud"),
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    detail: JSON.stringify(entry.detail ?? {}),
  });
}

/** Funnel source. Best-effort: a failed track must never fail the user's action. */
export async function track(
  name: string,
  props: { userId?: string; eventId?: string; [key: string]: unknown } = {},
): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      id: newId("an"),
      name,
      userId: props.userId ?? null,
      eventId: props.eventId ?? null,
      props: JSON.stringify(props),
    });
  } catch {
    // intentionally swallowed
  }
}
