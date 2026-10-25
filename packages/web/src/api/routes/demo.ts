import { base } from "../__core/app";
import { seedDemo, wipeDemo } from "../lib/seed";
import { releaseExpiredHolds } from "../lib/inventory";

/**
 * Demo data controls. A real deployment would seed through a migration; this exists so
 * the console can be reset to a known night without a shell. `seed` states out loud
 * which rows are deliberately inconsistent.
 */
export const demo = {
  seed: base.handler(async () => {
    const summary = await seedDemo();
    return summary;
  }),
  wipe: base.handler(async () => {
    await wipeDemo();
    return { ok: true };
  }),
  /** Clear the night's activity but keep the rooms and tiers. */
  clearActivity: base.handler(async () => {
    await releaseExpiredHolds();
    return { ok: true };
  }),
};
