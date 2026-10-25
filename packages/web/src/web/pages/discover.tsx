import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { useRooms } from "../queries/events";
import { Chip, Kicker, LiveDot, Loading, Meter, Money, Panel, PanelHead } from "../components/nox";

const ART: Record<string, string> = {
  a: "linear-gradient(155deg,#0b1c24,#141018 58%,#1a1030)",
  b: "linear-gradient(155deg,#1a1020,#10141c)",
  c: "linear-gradient(155deg,#101810,#121820)",
  d: "linear-gradient(155deg,#20160e,#121218)",
};

export default function TonightPage() {
  const rooms = useRooms();

  const list = rooms.data ?? [];
  const held = list.reduce((sum, r) => sum + r.held + r.issued, 0);
  const tightest = [...list].sort((a, b) => b.occupancy - a.occupancy)[0];
  const lastTier = [...list].sort((a, b) => a.remaining - b.remaining)[0];

  return (
    <div className="space-y-5">
      <section className="reveal pt-1">
        <Kicker tone="violet">Tonight · Yangon · discover</Kicker>
        <h1 className="mt-1.5 font-display text-[46px] leading-[0.92] tracking-[0.01em] sm:text-[62px]">
          The night is
          <br />
          <span className="text-amber">a network.</span>
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
          Discovery is the first state of entry, inventory and return. Every number below is read from the ticket
          record on this server, not typed into a page.
        </p>
      </section>

      <Panel tone="amber" className="reveal" >
        <PanelHead
          kicker="Pulse"
          title={rooms.isLoading ? "Reading the room…" : `${list.length} rooms live`}
          right={
            <span className="inline-flex items-center gap-1.5">
              <LiveDot />
              <Kicker>live</Kicker>
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          <div className="bg-panel px-4 py-3">
            <Kicker>Held + issued</Kicker>
            <div className="mt-1 font-display text-[30px] leading-none">{held}</div>
          </div>
          <div className="bg-panel px-4 py-3">
            <Kicker>Tightest room</Kicker>
            <div className="mt-1 font-display text-[30px] leading-none">{tightest ? `${tightest.occupancy}%` : "—"}</div>
            <div className="mt-1 font-mono text-[10.5px] text-muted">{tightest?.venue ?? "—"}</div>
          </div>
          <div className="bg-panel px-4 py-3">
            <Kicker>Thinnest lane</Kicker>
            <div className="mt-1 font-display text-[30px] leading-none">{lastTier?.remaining ?? "—"}</div>
            <div className="mt-1 font-mono text-[10.5px] text-muted">{lastTier?.name ?? "—"}</div>
          </div>
          <div className="bg-panel px-4 py-3">
            <Kicker>Door state</Kicker>
            <div className="mt-1 font-display text-[30px] leading-none text-success">open</div>
            <div className="mt-1 font-mono text-[10.5px] text-muted">online-first scanner</div>
          </div>
        </div>
      </Panel>

      {rooms.isLoading ? (
        <Loading rows={4} label="Loading rooms" />
      ) : rooms.isError ? (
        <Panel tone="danger" className="p-4 text-[13px] text-danger">
          Could not read tonight's rooms. The API is not answering.
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((room, i) => (
            <Link
              key={room.id}
              to={`/room/${room.id}`}
              className="reveal group block rounded-md border border-line border-t-2 border-t-line bg-panel transition-colors hover:border-t-amber"
              style={{ animationDelay: `${60 + i * 40}ms` }}
            >
              <div className="flex gap-3 p-3">
                <div
                  className="relative h-[86px] w-[74px] shrink-0 overflow-hidden rounded-sm"
                  style={{ background: ART[room.artKey] ?? ART.a }}
                  aria-hidden
                >
                  <span className="absolute inset-x-2 bottom-2 h-[2px] bg-gradient-to-r from-amber to-violet shadow-[0_0_12px_rgba(217,163,92,0.5)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate font-display text-[21px] leading-tight tracking-wide">{room.name}</h2>
                    <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted transition-colors group-hover:text-amber" />
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    {room.venue} · {room.area} · {room.genre}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">{room.window}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <Money amount={room.fromPrice} className="text-[12px] text-bone" />
                    <Chip tone={room.soldOut ? "danger" : room.occupancy > 70 ? "amber" : "none"}>
                      {room.soldOut ? "sold out" : `${room.remaining} left`}
                    </Chip>
                  </div>
                  <div className="mt-2">
                    <Meter value={room.held + room.issued} max={room.capacity} tone={room.occupancy > 85 ? "danger" : "amber"} />
                    <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted">
                      <span>{room.held + room.issued} / {room.capacity} held</span>
                      <span>{room.held} in flight · {room.issued} issued</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Panel className="reveal p-4">
        <Kicker tone="violet">How entry works here</Kicker>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted">
          A ticket is a row in this database, not a screenshot of intent. Pick a tier and inventory is held for
          {" "}20 minutes while you pay in your own wallet app. A human verifies the receipt, the server issues a
          signed single-use credential, and the door validates it against the record — once.
        </p>
      </Panel>
    </div>
  );
}
