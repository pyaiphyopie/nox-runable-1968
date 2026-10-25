import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCreateEvent, usePerformance, useRooms, useSetEventStatus } from "../queries/events";
import {
  Action,
  Chip,
  Empty,
  Field,
  Kicker,
  Loading,
  Meter,
  Money,
  Notice,
  Panel,
  PanelHead,
  Row,
  Stat,
  StatePill,
  inputClass,
} from "../components/nox";
import { cn } from "@/lib/utils";

interface DraftTier {
  name: string;
  priceMmk: number;
  capacity: number;
}

const DEFAULT_TIERS: DraftTier[] = [
  { name: "Early", priceMmk: 15000, capacity: 120 },
  { name: "Door", priceMmk: 25000, capacity: 140 },
];

/**
 * The form speaks MMT (UTC+6:30, no DST) end to end, so a `datetime-local` value
 * means the same thing in the input, on the server and on the door. Round-tripping
 * through the browser's own timezone would silently shift every door time.
 */
const MMT_OFFSET_MS = (6 * 60 + 30) * 60_000;

/** A real instant → the MMT wall clock the organizer should see. */
function toMmtInput(date: Date) {
  return new Date(date.getTime() + MMT_OFFSET_MS).toISOString().slice(0, 16);
}

/** An MMT wall clock typed into the form → the real instant it names. */
function fromMmtInput(value: string) {
  const wall = Date.parse(`${value}:00Z`);
  return new Date(Number.isNaN(wall) ? Date.now() : wall - MMT_OFFSET_MS);
}

/** Tonight's `hour` in Yangon, as an instant. Hours past 24 roll into tomorrow. */
function mmtTodayAt(hour: number) {
  const shifted = new Date(Date.now() + MMT_OFFSET_MS);
  const wall = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), hour, 0, 0);
  return new Date(wall - MMT_OFFSET_MS);
}

export default function OrganizerPage() {
  const rooms = useRooms();
  const createEvent = useCreateEvent();
  const setStatus = useSetEventStatus();

  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [area, setArea] = useState("Bahan");
  const [genre, setGenre] = useState("Techno");
  const [blurb, setBlurb] = useState("");
  const [lineup, setLineup] = useState("");
  const [doorsAt, setDoorsAt] = useState(() => toMmtInput(mmtTodayAt(22)));
  const [endsAt, setEndsAt] = useState(() => toMmtInput(mmtTodayAt(27)));
  const [capacity, setCapacity] = useState(300);
  const [tiers, setTiers] = useState<DraftTier[]>(DEFAULT_TIERS);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const performance = usePerformance(selected ?? undefined);
  const list = rooms.data ?? [];

  const submit = () => {
    setError(null);
    const doors = fromMmtInput(doorsAt);
    const ends = fromMmtInput(endsAt);
    if (ends <= doors) {
      setError("The close time has to be after doors. A 04:00 close is the next morning, not the same night.");
      return;
    }
    createEvent.mutate(
      {
        name,
        venueName,
        area,
        genre,
        blurb,
        lineup,
        doorsAt: doors,
        endsAt: ends,
        capacity,
        artKey: "a",
        promoter: "Pierre Computer Company",
        tiers: tiers.filter((t) => t.name.trim() && t.capacity > 0),
      },
      {
        onSuccess: (res) => {
          setSelected(res.id);
          setName("");
          setBlurb("");
          setLineup("");
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Could not create the room"),
      },
    );
  };

  return (
    <div className="space-y-4">
      <section className="reveal">
        <Kicker tone="violet">Organizer · Pierre Computer Company</Kicker>
        <h1 className="mt-1 font-display text-[40px] leading-[0.95] tracking-[0.01em] sm:text-[50px]">
          Put a room
          <br />
          <span className="text-amber">on the network.</span>
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          Creating a room writes the venue, the event and its tiers in one transaction. Inventory opens immediately and
          is held the moment someone checks out.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel tone="amber">
          <PanelHead kicker="New room" title="Event and inventory" right={<Chip>{tiers.length} tiers</Chip>} />
          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Event name">
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="AURA // After Dark" />
              </Field>
              <Field label="Venue">
                <input className={inputClass} value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="AURA" />
              </Field>
              <Field label="Area">
                <input className={inputClass} value={area} onChange={(e) => setArea(e.target.value)} />
              </Field>
              <Field label="Genre">
                <input className={inputClass} value={genre} onChange={(e) => setGenre(e.target.value)} />
              </Field>
              <Field label="Doors (MMT)">
                <input type="datetime-local" className={inputClass} value={doorsAt} onChange={(e) => setDoorsAt(e.target.value)} />
              </Field>
              <Field label="Close (MMT)">
                <input type="datetime-local" className={inputClass} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
            </div>

            <Field label="Lineup" hint="Separate names with a middle dot · or a comma.">
              <input className={inputClass} value={lineup} onChange={(e) => setLineup(e.target.value)} placeholder="Mira V. · Ko Sett" />
            </Field>
            <Field label="One line of copy">
              <input className={inputClass} value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Resident techno. Tight room." />
            </Field>
            <Field label="Room capacity">
              <input
                type="number"
                className={inputClass}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
            </Field>

            <div className="space-y-2 rounded-sm border border-line bg-panel2 p-3">
              <Kicker>Tiers</Kicker>
              {tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_84px_84px_28px] items-center gap-2">
                  <input
                    className={cn(inputClass, "py-2")}
                    value={t.name}
                    onChange={(e) => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="Early"
                  />
                  <input
                    type="number"
                    className={cn(inputClass, "py-2")}
                    value={t.priceMmk}
                    onChange={(e) => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, priceMmk: Number(e.target.value) } : x)))}
                  />
                  <input
                    type="number"
                    className={cn(inputClass, "py-2")}
                    value={t.capacity}
                    onChange={(e) => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, capacity: Number(e.target.value) } : x)))}
                  />
                  <button
                    type="button"
                    aria-label="Remove tier"
                    onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))}
                    className="grid size-7 place-items-center rounded-sm border border-line text-muted hover:border-danger hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2">
                <Action tone="ghost" onClick={() => setTiers((prev) => [...prev, { name: "", priceMmk: 20000, capacity: 100 }])}>
                  <Plus className="size-3.5" /> Add tier
                </Action>
                <span className="font-mono text-[10.5px] text-muted">
                  columns: name · price MMK · inventory
                </span>
              </div>
            </div>

            {error ? <Notice tone="danger">{error}</Notice> : null}

            <Action
              onClick={submit}
              loading={createEvent.isPending}
              disabled={name.trim().length < 2 || venueName.trim().length < 2}
              className="w-full"
            >
              {createEvent.isPending ? "Writing the room" : "Create and open inventory"}
            </Action>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHead kicker="Rooms" title="On the network" right={<Chip>{list.length}</Chip>} />
            <div className="space-y-2 p-4">
              {rooms.isLoading ? (
                <Loading rows={3} label="Loading rooms" />
              ) : list.length === 0 ? (
                <Empty title="No rooms yet" hint="Create the first one on the left." />
              ) : (
                list.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={cn(
                      "w-full rounded-sm border px-3 py-2.5 text-left transition-colors",
                      selected === r.id ? "border-amber bg-amber/8" : "border-line bg-panel2 hover:border-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-[18px] tracking-wide">{r.name}</span>
                      <StatePill state={r.status} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10.5px] text-muted">
                      <span>{r.venue} · {r.window}</span>
                      <span>{r.issued} issued · {r.remaining} left</span>
                    </div>
                    <div className="mt-1.5">
                      <Meter value={r.held + r.issued} max={r.capacity} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </Panel>

          {selected ? (
            <Panel tone="violet">
              <PanelHead
                kicker="Performance"
                title={performance.data?.name ?? "Reading…"}
                right={
                  <div className="flex gap-2">
                    <Action
                      tone="ghost"
                      onClick={() =>
                        setStatus.mutate({
                          eventId: selected,
                          status: performance.data?.status === "on_sale" ? "closed" : "on_sale",
                        })
                      }
                    >
                      {performance.data?.status === "on_sale" ? "Close sales" : "Open sales"}
                    </Action>
                  </div>
                }
              />
              <div className="space-y-3 p-4">
                {performance.isLoading ? (
                  <Loading rows={2} label="Loading performance" />
                ) : performance.data ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Stat label="Issued" value={performance.data.issued} sub={`of ${performance.data.capacity}`} tone="success" />
                      <Stat label="Inside" value={performance.data.inside} sub="scanned at the door" tone="violet" />
                      <Stat label="In flight" value={performance.data.held} sub="unverified holds" tone="amber" />
                    </div>
                    <div className="rounded-sm border border-line bg-panel2 px-3 py-2">
                      <Row label="Verified revenue" mono>
                        <Money amount={performance.data.revenueMmk} className="text-[14px] text-bone" />
                      </Row>
                      <Row label="Venue">{performance.data.venue}</Row>
                    </div>
                    <div>
                      <Kicker className="mb-2">Tiers</Kicker>
                      <ul className="space-y-1.5">
                        {performance.data.tiers.map((t) => (
                          <li key={t.id} className="flex items-center gap-3 font-mono text-[11px]">
                            <span className="text-bone">{t.name}</span>
                            <Money amount={t.priceMmk} className="text-muted" />
                            <span className="ml-auto text-muted">
                              {t.held} held · {t.remaining} left of {t.capacity}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
