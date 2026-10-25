import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Shared primitives. Everything visual in NOX is one of these. */

type Tone = "amber" | "violet" | "success" | "danger" | "none";

const TONE_BORDER: Record<Tone, string> = {
  amber: "border-t-amber",
  violet: "border-t-violet",
  success: "border-t-success",
  danger: "border-t-danger",
  none: "border-t-line",
};

const TONE_TEXT: Record<Tone, string> = {
  amber: "text-amber",
  violet: "text-violet",
  success: "text-success",
  danger: "text-danger",
  none: "text-muted",
};

export function Kicker({ children, tone = "none", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={cn("font-mono text-[10.5px] uppercase tracking-[0.16em]", TONE_TEXT[tone], className)}>
      {children}
    </div>
  );
}

export function Panel({
  children,
  className,
  tone = "none",
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <section className={cn("rounded-md border border-line border-t-2 bg-panel", TONE_BORDER[tone], className)}>
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  kicker,
  right,
  tone = "none",
}: {
  title: ReactNode;
  kicker?: ReactNode;
  right?: ReactNode;
  tone?: Tone;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
      <div>
        {kicker ? <Kicker tone={tone}>{kicker}</Kicker> : null}
        <h2 className="font-display text-[19px] leading-tight tracking-wide text-bone">{title}</h2>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

export function Chip({ children, tone = "none", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-[3px] font-mono text-[10.5px] uppercase tracking-[0.1em]",
        tone === "none" && "border-line text-muted",
        tone === "amber" && "border-amber/45 text-amber",
        tone === "violet" && "border-violet/45 text-violet",
        tone === "success" && "border-success/45 text-success",
        tone === "danger" && "border-danger/45 text-danger",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveDot({ tone = "success" }: { tone?: Tone }) {
  const color = tone === "danger" ? "bg-danger" : tone === "amber" ? "bg-amber" : "bg-success";
  return <span className={cn("live-dot inline-block size-[7px] rounded-full", color)} />;
}

const STATE_TONE: Record<string, Tone> = {
  AWAITING_PAYMENT: "amber",
  PROOF_SUBMITTED: "amber",
  VERIFIED: "success",
  REJECTED: "danger",
  EXPIRED: "none",
  RESERVED: "none",
  ISSUED: "success",
  SCANNED: "violet",
  VOID: "danger",
  ACCEPTED: "success",
  OK: "success",
  SUBMITTED: "amber",
  on_sale: "success",
  draft: "none",
  closed: "danger",
  open: "amber",
  applied: "violet",
  dismissed: "none",
  critical: "danger",
  warn: "amber",
  info: "violet",
};

export function StatePill({ state, className }: { state: string; className?: string }) {
  return (
    <Chip tone={STATE_TONE[state] ?? "none"} className={className}>
      {state.replace(/_/g, " ")}
    </Chip>
  );
}

export function Meter({ value, max, tone = "amber" }: { value: number; max: number; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar =
    tone === "danger"
      ? "bg-danger"
      : tone === "success"
        ? "bg-success"
        : tone === "violet"
          ? "bg-violet"
          : "bg-amber";
  return (
    <div className="h-[5px] w-full overflow-hidden rounded-full bg-panel2">
      <div className={cn("h-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "none",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2.5">
      <Kicker>{label}</Kicker>
      <div className={cn("mt-1 font-display text-[26px] leading-none tracking-wide", tone === "none" ? "text-bone" : TONE_TEXT[tone])}>
        {value}
      </div>
      {sub ? <div className="mt-1 font-mono text-[10.5px] text-muted">{sub}</div> : null}
    </div>
  );
}

export function Row({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-[7px] last:border-b-0">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className={cn("text-right text-[13px]", mono && "font-mono tabular-nums")}>{children}</span>
    </div>
  );
}

export function Money({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {new Intl.NumberFormat("en-US").format(amount)} <span className="text-muted">MMK</span>
    </span>
  );
}

export function Action({
  children,
  onClick,
  tone = "amber",
  disabled,
  loading,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: Tone | "ghost";
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles =
    tone === "ghost"
      ? "border border-line bg-transparent text-bone hover:border-muted"
      : tone === "danger"
        ? "border border-danger/50 bg-danger/10 text-danger hover:bg-danger/16"
        : tone === "success"
          ? "border border-success/50 bg-success/10 text-success hover:bg-success/16"
          : tone === "violet"
            ? "border border-violet/50 bg-violet/12 text-violet hover:bg-violet/18"
            : "border border-amber bg-amber text-[#12100c] hover:bg-amber/88";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        styles,
        className,
      )}
    >
      {loading ? <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <Kicker className="mb-1.5">{label}</Kicker>
      {children}
      {hint ? <p className="mt-1.5 text-[12px] leading-snug text-muted">{hint}</p> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-sm border border-line bg-panel2 px-3 py-2.5 font-mono text-[12.5px] text-bone placeholder:text-muted/60 focus:border-amber focus:outline-none";

export function Loading({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-[52px] animate-pulse rounded-md border border-line bg-panel" />
      ))}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-8 text-center">
      <p className="text-[13.5px] text-bone">{title}</p>
      {hint ? <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: Tone; children: ReactNode }) {
  const styles =
    tone === "danger"
      ? "border-danger/40 bg-danger/8 text-danger"
      : tone === "success"
        ? "border-success/40 bg-success/8 text-success"
        : tone === "violet"
          ? "border-violet/40 bg-violet/8 text-violet"
          : "border-amber/40 bg-amber/8 text-amber";
  return <div className={cn("rounded-sm border px-3 py-2.5 text-[12.5px] leading-snug", styles)}>{children}</div>;
}

/** Timestamp in Yangon time, mono. */
export function Clock({ date }: { date: Date | string | null }) {
  if (!date) return <span className="text-muted">—</span>;
  const d = typeof date === "string" ? new Date(date) : date;
  const shifted = new Date(d.getTime() + (6 * 60 + 30) * 60_000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted">
      {hh}:{mm}:{ss}
    </span>
  );
}
