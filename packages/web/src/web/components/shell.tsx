import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Kicker, LiveDot } from "./nox";

const NAV = [
  { href: "/", label: "Tonight", surface: "consumer" },
  { href: "/tickets", label: "Credentials", surface: "consumer" },
  { href: "/door", label: "Door", surface: "door" },
  { href: "/ops", label: "Ops", surface: "ops" },
  { href: "/organizer", label: "Organizer", surface: "organizer" },
];

function useMmtClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const shifted = new Date(now.getTime() + (6 * 60 + 30) * 60_000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const clock = useMmtClock();

  const active = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-void/92 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-sm border border-amber/60 bg-amber/12 font-display text-[15px] font-bold text-amber"
            >
              N
            </span>
            <span className="leading-none">
              <span className="block font-display text-[17px] tracking-[0.06em] text-bone">NOX</span>
              <span className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">
                Yangon · beta
              </span>
            </span>
          </Link>

          <nav className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto pb-1 sm:order-none sm:mx-0 sm:w-auto sm:pb-0">
            {NAV.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "shrink-0 rounded-sm px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                  active(item.href) ? "bg-panel2 text-amber" : "text-muted hover:text-bone",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <LiveDot />
              <Kicker>live</Kicker>
            </span>
            <span className="font-mono text-[11.5px] tabular-nums text-bone">{clock}</span>
            <Kicker>MMT</Kicker>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 pb-24 pt-6 sm:px-6">{children}</main>

      <footer className="border-t border-line px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-[1120px] space-y-1.5">
          <Kicker>NOX · transactional infrastructure, not a social app</Kicker>
          <p className="max-w-3xl text-[12px] leading-relaxed text-muted">
            Payment is manual mobile-money verification: the payer moves money in their own wallet app and a human
            compares the receipt. Nothing here calls KBZPay, WavePay, AyaPay or CBPay. The ticket record on this
            server — not the QR image — is what admits a guest.
          </p>
        </div>
      </footer>
    </div>
  );
}
