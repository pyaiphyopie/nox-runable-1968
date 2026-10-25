import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ScanLine, X } from "lucide-react";
import { useRecentScans, useRoomsForDoor, useScan, useScanStats } from "../queries/entry";
import { CameraScan } from "../components/camera-scan";
import {
  Action,
  Chip,
  Clock,
  Empty,
  Kicker,
  Loading,
  Notice,
  Panel,
  PanelHead,
  Row,
  Stat,
  StatePill,
  inputClass,
} from "../components/nox";
import { cn } from "@/lib/utils";

export default function DoorPage() {
  const rooms = useRoomsForDoor();
  const [eventId, setEventId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const scan = useScan();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const roomList = rooms.data ?? [];
  const activeRoom = useMemo(
    () => roomList.find((r) => r.id === eventId) ?? roomList[0],
    [roomList, eventId],
  );

  const scans = useRecentScans(activeRoom?.id);
  const stats = useScanStats(activeRoom?.id);

  const submit = useCallback(
    (value: string) => {
      const t = value.trim();
      if (t.length < 8) return;
      scan.mutate(
        { token: t, eventId: activeRoom?.id, scannedBy: "door", device: "web" },
        {
          onSuccess: (res) => {
            setFlash(res.result === "ACCEPTED" ? "ok" : "bad");
            setToken("");
            inputRef.current?.focus();
          },
        },
      );
    },
    [activeRoom?.id, scan],
  );

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [flash]);

  const decision = scan.data;

  return (
    <div className="space-y-4">
      <section className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker tone="violet">Door · venue staff</Kicker>
          <h1 className="mt-1 font-display text-[40px] leading-[0.95] tracking-[0.01em] sm:text-[50px]">
            One scan,
            <br />
            <span className="text-amber">one decision.</span>
          </h1>
        </div>
        <label className="min-w-[220px]">
          <Kicker className="mb-1.5">Which door are you standing at?</Kicker>
          <select
            className={inputClass}
            value={activeRoom?.id ?? ""}
            onChange={(e) => setEventId(e.target.value)}
          >
            {roomList.map((r) => (
              <option key={r.id} value={r.id}>
                {r.venue} · {r.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {rooms.isLoading ? <Loading rows={2} label="Loading rooms" /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Admitted here" value={stats.data?.accepted ?? "—"} sub={`${activeRoom?.window ?? ""}`} tone="success" />
        <Stat label="Turned away" value={stats.data?.rejected ?? "—"} sub="every refusal is recorded" tone="danger" />
        <Stat label="Attempts" value={stats.data?.total ?? "—"} sub="accepted + refused" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel tone="amber">
          <PanelHead
            kicker="Credential"
            title="Scan or type the token"
            right={activeRoom ? <Chip tone="amber">{activeRoom.venue}</Chip> : null}
          />
          <div className="space-y-3 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(token);
              }}
              className="space-y-2"
            >
              <input
                ref={inputRef}
                autoFocus
                className={cn(inputClass, "py-3 text-[13px]")}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the token from the guest's credential"
                spellCheck={false}
                autoComplete="off"
              />
              <Action type="submit" disabled={token.trim().length < 8} loading={scan.isPending} className="w-full">
                <ScanLine className="size-3.5" /> {scan.isPending ? "Checking the record" : "Scan"}
              </Action>
            </form>

            <CameraScan onDetect={submit} />

            <Notice tone="violet">
              The scan commits immediately — no second confirmation while a queue builds. A refusal is recorded just as
              loudly as an acceptance.
            </Notice>
          </div>
        </Panel>

        <div className="space-y-4">
          {decision ? (
            <Panel tone={decision.result === "ACCEPTED" ? "success" : "danger"} className={flash === "ok" ? "flash-ok" : flash === "bad" ? "flash-bad" : ""}>
              <div className="flex items-start gap-3 p-4">
                <span
                  className={cn(
                    "mt-0.5 grid size-10 shrink-0 place-items-center rounded-sm border",
                    decision.result === "ACCEPTED" ? "border-success/50 bg-success/12 text-success" : "border-danger/50 bg-danger/12 text-danger",
                  )}
                >
                  {decision.result === "ACCEPTED" ? <Check className="size-5" /> : <X className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <Kicker tone={decision.result === "ACCEPTED" ? "success" : "danger"}>
                    {decision.result === "ACCEPTED" ? "admit" : `refuse · ${decision.reason.replace(/_/g, " ")}`}
                  </Kicker>
                  <h2 className="font-display text-[28px] leading-tight tracking-wide">{decision.gateMessage}</h2>
                  <div className="mt-2 space-y-0">
                    <Row label="Holder">{decision.holder ?? "—"}</Row>
                    <Row label="Tier">{decision.tier ?? "—"}</Row>
                    <Row label="Order" mono>{decision.orderRef ?? "—"}</Row>
                    <Row label="Room">{decision.eventName ?? "—"}</Row>
                    <Row label="Scanned" mono><Clock date={decision.scannedAt} /></Row>
                  </div>
                </div>
              </div>
              <div className="border-t border-line p-4">
                <Kicker className="mb-2">Checks that ran, in order</Kicker>
                <ol className="space-y-1.5">
                  {decision.checks.map((c, i) => (
                    <li key={c.name} className="flex items-start gap-2 font-mono text-[11px]">
                      <span className="text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <span className={c.pass ? "text-success" : "text-danger"}>{c.pass ? "pass" : "fail"}</span>
                      <span className="text-bone">{c.name}</span>
                      <span className="ml-auto text-right text-muted">{c.detail}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Panel>
          ) : (
            <Panel>
              <PanelHead kicker="Standing by" title="No credential scanned yet" />
              <div className="p-4">
                <p className="text-[13px] leading-relaxed text-muted">
                  Every attempt lands here with the reasoning attached — signature, ticket record, room, payment state,
                  and single-use — so a refusal can be explained to the person in front of you without guessing.
                </p>
              </div>
            </Panel>
          )}

          <Panel>
            <PanelHead kicker="Door log" title="Recent attempts" right={<Chip>{activeRoom?.venue ?? "—"}</Chip>} />
            <div className="max-h-[360px] overflow-auto p-4">
              {scans.isLoading ? (
                <Loading rows={3} label="Loading scans" />
              ) : (scans.data ?? []).length === 0 ? (
                <Empty title="Nothing scanned yet tonight" hint="The first scan will appear here within a few seconds." />
              ) : (
                <ul className="space-y-2">
                  {(scans.data ?? []).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 rounded-sm border border-line bg-panel2 px-3 py-2">
                      <Clock date={s.at} />
                      <StatePill state={s.result} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
                        {s.reason.replace(/_/g, " ")} · {s.ticketId ?? "unknown"}
                      </span>
                      <Chip>{s.device}</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
