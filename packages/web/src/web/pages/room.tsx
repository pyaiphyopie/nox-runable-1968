import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useRoom } from "../queries/events";
import { useAdapters } from "../queries/payments";
import { useCreateOrder } from "../queries/orders";
import {
  Action,
  Chip,
  Empty,
  Kicker,
  Loading,
  Meter,
  Money,
  Notice,
  Panel,
  PanelHead,
  Row,
  StatePill,
  inputClass,
} from "../components/nox";
import { cn } from "@/lib/utils";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const room = useRoom(id);
  const adapters = useAdapters();
  const createOrder = useCreateOrder();

  const [tierId, setTierId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One key per checkout attempt: a retry on a bad connection replays the same order
  // instead of holding inventory twice.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const tiers = room.data?.tiers ?? [];
  const selected = useMemo(() => tiers.find((t) => t.id === tierId) ?? tiers.find((t) => t.remaining > 0), [tiers, tierId]);
  const chosenProvider = provider ?? adapters.data?.[0]?.id ?? "KBZPAY";
  const maxQty = Math.min(6, selected?.remaining ?? 1);
  const total = (selected?.priceMmk ?? 0) * qty;

  if (room.isLoading) return <Loading rows={5} label="Loading room" />;
  if (room.isError || !room.data) {
    return (
      <Panel tone="danger" className="p-4">
        <Kicker tone="danger">404</Kicker>
        <p className="mt-1 text-[13px]">That room is not on tonight's list.</p>
        <Link to="/" className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-amber">
          Back to tonight
        </Link>
      </Panel>
    );
  }

  const r = room.data;

  const submit = () => {
    if (!selected) return;
    setError(null);
    createOrder.mutate(
      { eventId: r.id, tierId: selected.id, qty, provider: chosenProvider, idempotencyKey: idempotencyKey.current },
      {
        onSuccess: (res) => {
          if (!res.order) return;
          idempotencyKey.current = crypto.randomUUID();
          navigate(`/checkout/${res.order.id}`);
        },
        onError: (err) => setError(err instanceof Error ? err.message : "Could not hold that tier"),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted hover:text-bone">
        <ArrowLeft className="size-3.5" /> Tonight
      </Link>

      <section className="reveal">
        <Kicker tone="violet">
          {r.genre} · {r.area} · {r.window}
        </Kicker>
        <h1 className="mt-1 font-display text-[40px] leading-[0.95] tracking-[0.01em] sm:text-[54px]">{r.name}</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{r.blurb}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatePill state={r.status} />
          <Chip>{r.venue}</Chip>
          <Chip>{r.lineup.join(" · ") || "lineup TBA"}</Chip>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <Panel tone="amber">
            <PanelHead kicker="Room" title="Capacity" right={<Chip tone={r.occupancy > 85 ? "danger" : "amber"}>{r.occupancy}% held</Chip>} />
            <div className="space-y-3 p-4">
              <Meter value={r.held + r.issued} max={r.capacity} tone={r.occupancy > 85 ? "danger" : "amber"} />
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm bg-line">
                {[
                  { label: "Capacity", value: r.capacity },
                  { label: "Issued", value: r.issued },
                  { label: "In flight", value: r.held },
                ].map((cell) => (
                  <div key={cell.label} className="bg-panel px-3 py-2.5">
                    <Kicker>{cell.label}</Kicker>
                    <div className="mt-0.5 font-display text-[24px] leading-none">{cell.value}</div>
                  </div>
                ))}
              </div>
              <p className="text-[12.5px] leading-snug text-muted">
                "In flight" is inventory held by orders that have not been verified yet. Those holds expire, and
                expired holds put the inventory back on the shelf automatically.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHead kicker="Doors" title="Room state" />
            <div className="p-4">
              <Row label="Venue">{r.venue} · {r.venueArea}</Row>
              <Row label="Window" mono>{r.window}</Row>
              <Row label="Tiers">{r.tiers.length}</Row>
              <Row label="Lineup">{r.lineup.join(" · ") || "TBA"}</Row>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel tone="violet">
            <PanelHead kicker="Book" title="Choose a lane" right={<Kicker>{tiers.length} tiers</Kicker>} />
            <div className="space-y-3 p-4">
              {tiers.length === 0 ? (
                <Empty title="No tiers on sale" hint="The organizer has not opened inventory for this room." />
              ) : (
                <div className="space-y-2">
                  {tiers.map((t) => {
                    const isSel = selected?.id === t.id;
                    const gone = t.remaining === 0;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={gone}
                        onClick={() => {
                          setTierId(t.id);
                          setQty(1);
                        }}
                        className={cn(
                          "w-full rounded-sm border px-3 py-3 text-left transition-colors",
                          isSel ? "border-amber bg-amber/8" : "border-line bg-panel2 hover:border-muted",
                          gone && "cursor-not-allowed opacity-45",
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-display text-[18px] tracking-wide">{t.name}</span>
                          <Money amount={t.priceMmk} className="text-[13px]" />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 font-mono text-[10.5px] text-muted">
                          <span>{t.remaining} of {t.capacity} remaining</span>
                          <span>{gone ? "sold out" : `${t.held} held`}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <Kicker className="mb-1.5">Quantity</Kicker>
                  <select className={inputClass} value={qty} onChange={(e) => setQty(Number(e.target.value))}>
                    {Array.from({ length: Math.max(1, maxQty) }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <Kicker className="mb-1.5">Wallet</Kicker>
                  <select className={inputClass} value={chosenProvider} onChange={(e) => setProvider(e.target.value)}>
                    {(adapters.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-sm border border-line bg-panel2 px-3 py-2.5">
                <Row label="Total" mono>
                  <Money amount={total} className="text-[14px] text-bone" />
                </Row>
                <Row label="Held for">20 minutes</Row>
                <Row label="Entry">single-use QR · validated at the door</Row>
              </div>

              {error ? <Notice tone="danger">{error}</Notice> : null}

              <Action onClick={submit} disabled={!selected || !r.tiers.length} loading={createOrder.isPending} className="w-full">
                {createOrder.isPending ? "Holding inventory" : "Hold inventory and pay"}
              </Action>
              <p className="text-[11.5px] leading-snug text-muted">
                Nothing is charged here. Holding inventory reserves the seats; payment happens in your wallet app on
                the next screen.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
