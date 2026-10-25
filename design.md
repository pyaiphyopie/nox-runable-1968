# NOX — Design

Transactional nightlife infrastructure for Yangon: discovery → order → manual-verified mobile-money payment → single-use QR entry → door scan → venue ops. Ships on web (consumer, scanner, ops console, organizer console) and mobile (consumer Android-first + door scanner). The visual direction comes from the NOX Core architecture blueprint: void-black panels, bone type, amber as the action color, violet for machine/system voice, mono for anything that is a number or an identifier.

The core job: a ticket is a database row, not a screenshot of intent. Payment, ticket and entry must never disagree, and the door must be able to prove it.

## Brand & Colors

One token set, consumed per platform:

- **Web & desktop**: CSS variables in `packages/web/src/web/styles.css`.
- **Mobile**: `Colors.light` / `Colors.dark` in `packages/mobile/constants/theme.ts`, read via `useColors()`.

The product is dark-only (a nightlife system); light values mirror dark so nothing breaks if the OS is in light mode.

| Token | Value | Use |
|-------|-------|-----|
| void | #0A0A0D | Page background |
| panel | #15151B | Cards, surfaces |
| panel-2 | #1C1C24 | Raised rows, inputs |
| bone | #ECEAE6 | Primary text |
| muted | #9B98A6 | Secondary text, labels |
| amber | #D9A35C | Primary action, focus, "money is good" |
| violet | #8E72F2 | System / agent / machine voice |
| border | #2A2A33 | Hairlines |
| success | #6FBF8B | Verified, accepted, coherent |
| danger | #E2645A | Rejected, mismatch, void |
| warning | #D9A35C | Awaiting human, expiring hold |

Status color rules (never decorative):
- Amber = a human must act (verify a receipt, approve a gate).
- Violet = the system acted on its own and the record shows it.
- Green = three sources agree. Red = they do not.

## Typography

- **Display**: Big Shoulders (700/900), tight line height, uppercase for page heads. Numbers and headlines only.
- **Body**: Inter (400/500/600) at 13.5–16px, 1.5 line height.
- **Data**: IBM Plex Mono (400/500) for order refs, ticket tokens, money, timestamps, state names, log lines.

Web loads all three from Google Fonts in `index.html`; mono and display fall back to system equivalents. Mobile uses system sans plus `monospace` from `Fonts` for identifiers.

## Layout & Spacing

- Max content width 1080px, 20px gutters. 4px base unit; 8/12/16/24/32 spacing scale.
- Panels are cards with 1px borders and a 2px top border in the semantic color. No drop shadows, no glassmorphism, no rounded-everything: radius 6px, 4px on small chips.
- Dense on purpose. The ops console is a work surface, not a landing page.
- Split layouts: a persistent left rail on the ops console; the consumer journey is a single column capped at 460px so it reads as a phone lane at any width.
- Mono labels in uppercase with 0.06em tracking; content in sentence case.

## Motion

- One staggered page-load reveal per surface (CSS only, 40ms steps, translateY 6px + fade).
- State changes get a single 150ms color transition. Accepted scans flash green once, rejected flash red once.
- No continuous animation except the live-state dot and the scanner idle pulse.

## Pages & Screens

- **Web — Tonight** (`packages/web/src/web/pages/discover.tsx`) — live rooms from the DB, held/total derived from tier inventory, next-room state.
- **Web — Room** (`pages/event.tsx`) — event detail, tiers with live remaining, lineup, capacity bar.
- **Web — Checkout** (`pages/checkout.tsx`) — tier + quantity, order created server-side, payment instructions for the chosen wallet, reference + receipt upload, submit for verification.
- **Web — Ticket** (`pages/ticket.tsx`) — order state, issued ticket, QR from a signed single-use token, scan state.
- **Web — Door** (`pages/door.tsx`) — scanner for venue staff: enter/paste a token (or scan where the browser supports it), get accept/deny with the reason, recent scans list.
- **Web — Ops** (`pages/ops.tsx`) — verification queue, coherence monitor, agent desk running real handlers over real rows, audit log.
- **Web — Organizer** (`pages/organizer.tsx`) — create event, manage tiers, sales and check-in per event.
- **Mobile — Tonight / Room / Checkout / Ticket** (`packages/mobile/app/(tabs)/`) — consumer journey.
- **Mobile — Door** (`packages/mobile/app/(tabs)/door.tsx`) — venue scanner tab, camera or manual token.

## Key User Flows

1. **Buy**: Tonight → Room → pick tier/qty → order row created with an inventory hold and an idempotency key → pay out-of-band in KBZPay/WavePay → submit payer reference + receipt → order moves to PROOF_SUBMITTED.
2. **Verify**: Ops sees the proof in the queue → approve or reject with a reason → approval issues N ticket rows, each with a signed token, and writes an audit entry.
3. **Enter**: Door enters/scans the token → server validates signature, ticket state, event, and prior scans → writes an entry row, flips the ticket to SCANNED → second scan of the same token is denied as already-used.
4. **Reconcile**: If payment, ticket and entry ever disagree (rejected payment with a live ticket, accepted entry with no ticket), the coherence monitor raises a violation, the agent desk proposes a specific repair against specific rows, and applying it writes an audit record.

## Architecture

- **API**: typed oRPC client (`lib/api.ts` in each package) → backend in `@template/web`. Domain modules in `src/api/routes/`: events, orders, payments, tickets, entry, ops, analytics. Query hooks live in `queries/` (one file per feature).
- **State/sync**: TanStack Query; live screens poll on a short interval (this stack has no managed realtime channel — polling is the honest equivalent of the blueprint's Supabase Realtime).
- **Money**: no live wallet integration. A payment adapter seam (`src/api/lib/payments.ts`) declares KBZPay/WavePay/AyaPay/CBPay with a manual-verification flow; swapping in a PSP webhook is a change in that one file.
- **Inventory**: holds expire; expired orders release inventory back to the tier.
