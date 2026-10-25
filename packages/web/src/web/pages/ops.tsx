import { useState } from "react";
import { Bot, Check, FileImage, Play, RefreshCw, ShieldAlert, Wrench, X } from "lucide-react";
import {
  useAgentTasks,
  useApplyTask,
  useAudit,
  useCoherence,
  useDismissTask,
  useFunnel,
  useOpsOverview,
  useOpsRooms,
  useRunAgents,
  useSeedDemo,
} from "../queries/ops";
import { useVerificationQueue } from "../queries/orders";
import { useRejectPayment, useVerifyPayment, receiptUrl } from "../queries/payments";
import {
  Action,
  Chip,
  Clock,
  Empty,
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

function ReceiptLink({ objectKey }: { objectKey: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-violet hover:text-amber"
      onClick={async () => {
        setBusy(true);
        try {
          const url = await receiptUrl(objectKey);
          window.open(url, "_blank", "noopener");
        } finally {
          setBusy(false);
        }
      }}
    >
      <FileImage className="size-3.5" /> {busy ? "opening" : "view receipt"}
    </button>
  );
}

function VerificationQueue() {
  const queue = useVerificationQueue();
  const verify = useVerifyPayment();
  const reject = useRejectPayment();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const pending = queue.data?.pending ?? [];

  return (
    <Panel tone="amber">
      <PanelHead
        kicker="Manual verification"
        title="Money waiting on a human"
        right={<Chip tone={pending.length ? "amber" : "none"}>{pending.length} in queue</Chip>}
      />
      <div className="space-y-4 p-4">
        {queue.isLoading ? (
          <Loading rows={2} label="Loading queue" />
        ) : pending.length === 0 ? (
          <Empty title="Nothing waiting" hint="Proofs land here the moment a payer submits a transaction ID." />
        ) : (
          pending.map((order) => (
            <div key={order.id} className="rounded-sm border border-line bg-panel2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Kicker tone="violet">{order.adapter.label} · {order.adapter.referenceLabel}</Kicker>
                  <div className="font-display text-[22px] leading-tight tracking-wide">{order.ref}</div>
                  <p className="font-mono text-[11px] text-muted">
                    {order.event.name} · {order.tier.name} × {order.qty}
                  </p>
                </div>
                <div className="text-right">
                  <Money amount={order.amountMmk} className="text-[15px] text-bone" />
                  <div className="mt-1 flex justify-end gap-1.5">
                    <StatePill state={order.status} />
                    <Chip>{order.holdSecondsLeft > 0 ? `hold ${Math.ceil(order.holdSecondsLeft / 60)}m` : "hold lapsed"}</Chip>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-sm border border-line bg-panel px-3 py-2">
                  <Row label="Transaction ID" mono>{order.payment?.payerReference ?? "—"}</Row>
                  <Row label="Payer phone" mono>{order.payment?.payerPhone ?? "—"}</Row>
                  <Row label="Receipt">
                    {order.payment?.receiptUrl ? <ReceiptLink objectKey={order.payment.receiptUrl} /> : <span className="text-muted">not attached</span>}
                  </Row>
                  <Row label="Expected amount" mono><Money amount={order.amountMmk} /></Row>
                </div>
                <div className="rounded-sm border border-line bg-panel px-3 py-2">
                  <Kicker className="mb-1.5">Verifier checklist</Kicker>
                  <ul className="space-y-1">
                    {(queue.data?.checklist ?? []).map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-[12px] leading-snug text-muted">
                        <span className="mt-[3px] size-1.5 shrink-0 rounded-full bg-amber" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {order.payment?.flags.length ? (
                <div className="mt-2">
                  <Notice tone="danger">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldAlert className="size-3.5" /> Flagged: {order.payment.flags.join(", ")}
                    </span>
                  </Notice>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Action
                  tone="success"
                  loading={verify.isPending && verify.variables?.orderId === order.id}
                  onClick={() =>
                    verify.mutate(
                      { orderId: order.id, overrideFlags: order.payment?.flags.length ? true : false },
                      { onError: (e) => setReasons((r) => ({ ...r, [order.id]: e instanceof Error ? e.message : "Failed" })) },
                    )
                  }
                >
                  <Check className="size-3.5" /> {order.payment?.flags.length ? "Override and approve" : "Approve and issue"}
                </Action>
                <input
                  className={cn(inputClass, "max-w-[280px] flex-1 py-2")}
                  placeholder="Reason for rejection"
                  value={reasons[order.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [order.id]: e.target.value }))}
                />
                <Action
                  tone="danger"
                  disabled={(reasons[order.id] ?? "").trim().length < 3}
                  loading={reject.isPending}
                  onClick={() => reject.mutate({ orderId: order.id, reason: (reasons[order.id] ?? "").trim() })}
                >
                  <X className="size-3.5" /> Reject
                </Action>
              </div>
            </div>
          ))
        )}

        {(queue.data?.recent ?? []).length ? (
          <div className="border-t border-line pt-3">
            <Kicker className="mb-2">Recently verified</Kicker>
            <ul className="space-y-1.5">
              {(queue.data?.recent ?? []).map((o) => (
                <li key={o.id} className="flex items-center gap-3 font-mono text-[11px] text-muted">
                  <span className="text-success">{o.ref}</span>
                  <span className="truncate">{o.event.name}</span>
                  <span className="ml-auto">{o.tickets.length} issued</span>
                  <Money amount={o.amountMmk} className="text-bone" />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function CoherenceMonitor() {
  const coherence = useCoherence();
  const runAgents = useRunAgents();
  const violations = coherence.data?.violations ?? [];

  return (
    <Panel tone={violations.some((v) => v.severity === "critical") ? "danger" : "success"}>
      <PanelHead
        kicker="Invariant"
        title="Payment · ticket · entry"
        right={
          <div className="flex items-center gap-2">
            <Chip tone={violations.length ? "danger" : "success"}>
              {violations.length ? `${violations.length} violation${violations.length === 1 ? "" : "s"}` : "coherent"}
            </Chip>
            <Action tone="ghost" loading={runAgents.isPending} onClick={() => runAgents.mutate(undefined)}>
              <Play className="size-3.5" /> Open tasks
            </Action>
          </div>
        }
      />
      <div className="space-y-3 p-4">
        {coherence.isLoading ? (
          <Loading rows={2} label="Checking coherence" />
        ) : violations.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted">
            Nothing disagrees. Every live credential has a verified payment behind it, every verified payment has a
            credential, every accepted entry has a ticket, and no hold is past its clock.
          </p>
        ) : (
          violations.map((v) => (
            <div
              key={`${v.code}-${v.entityId}`}
              className={cn(
                "rounded-sm border bg-panel2 px-3 py-3",
                v.severity === "critical" ? "border-danger/45" : "border-amber/40",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={v.severity === "critical" ? "danger" : "amber"}>{v.code.replace(/_/g, " ")}</Chip>
                <span className="font-mono text-[10.5px] text-muted">{v.entityType} · {v.entityId}</span>
              </div>
              <div className="mt-1.5 font-display text-[19px] leading-tight tracking-wide">{v.title}</div>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">{v.detail}</p>
              <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-amber">
                <Wrench className="mt-0.5 size-3.5 shrink-0" />
                {coherence.data?.meanings[v.action]}
              </p>
            </div>
          ))
        )}
        <div className="border-t border-line pt-3">
          <Kicker>Checks that run</Kicker>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(coherence.data?.checked ?? []).map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function AgentDesk() {
  const overview = useOpsOverview();
  const [status, setStatus] = useState<"open" | "applied" | "all">("open");
  const tasks = useAgentTasks(status);
  const runAgents = useRunAgents();
  const applyTask = useApplyTask();
  const dismissTask = useDismissTask();
  const [result, setResult] = useState<string | null>(null);

  const agents = overview.data?.agents ?? [];
  const list = tasks.data ?? [];

  return (
    <Panel tone="violet">
      <PanelHead
        kicker="Agent desk"
        title="Handlers, not theatre"
        right={
          <div className="flex items-center gap-2">
            {(["open", "applied", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-sm px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em]",
                  status === s ? "bg-panel2 text-amber" : "text-muted hover:text-bone",
                )}
              >
                {s}
              </button>
            ))}
            <Action loading={runAgents.isPending} onClick={() => runAgents.mutate(undefined)}>
              <Play className="size-3.5" /> Run agents
            </Action>
          </div>
        }
      />
      <div className="space-y-4 p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a) => (
            <div key={a.id} className="rounded-sm border border-line bg-panel2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[17px] tracking-wide">{a.name}</span>
                <Chip tone={a.policy === "execute" ? "success" : a.policy === "suggest" ? "amber" : "violet"}>{a.policy}</Chip>
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-muted">{a.brief}</p>
            </div>
          ))}
        </div>

        {runAgents.data ? (
          <Notice tone="violet">
            Ran at <Clock date={runAgents.data.ranAt} /> —{" "}
            {runAgents.data.summary
              .map((s) => `${s.agent}: ${s.scanned} row(s) scanned, ${s.raised} task(s) opened (${s.note})`)
              .join(" · ")}
          </Notice>
        ) : null}

        {result ? <Notice tone="success">{result}</Notice> : null}

        {tasks.isLoading ? (
          <Loading rows={3} label="Loading tasks" />
        ) : list.length === 0 ? (
          <Empty
            title="No tasks"
            hint="Run the agents. They read real rows: credentials against payments, reused transaction IDs, tier fill, and proofs nobody has looked at."
          />
        ) : (
          <ul className="space-y-2">
            {list.map((task) => (
              <li
                key={task.id}
                className={cn(
                  "rounded-sm border bg-panel2 px-3 py-3",
                  task.severity === "critical" ? "border-danger/45" : task.severity === "warn" ? "border-amber/40" : "border-line",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="violet">
                    <Bot className="size-3" /> {task.agent}
                  </Chip>
                  <Chip tone={task.severity === "critical" ? "danger" : task.severity === "warn" ? "amber" : "none"}>
                    {task.severity}
                  </Chip>
                  <Chip>{task.policy}</Chip>
                  <StatePill state={task.status} />
                  <span className="ml-auto font-mono text-[10.5px] text-muted">
                    {task.entityType} · {task.entityId}
                  </span>
                </div>
                <div className="mt-1.5 font-display text-[19px] leading-tight tracking-wide">{task.title}</div>
                <p className="mt-1 text-[12.5px] leading-snug text-muted">{task.detail}</p>
                {task.meaning ? (
                  <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-amber">
                    <Wrench className="mt-0.5 size-3.5 shrink-0" /> {task.meaning}
                  </p>
                ) : (
                  <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
                    advisory · nothing to apply
                  </p>
                )}
                {task.status === "open" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {task.action ? (
                      <Action
                        tone="success"
                        loading={applyTask.isPending && applyTask.variables?.taskId === task.id}
                        onClick={() =>
                          applyTask.mutate(
                            { taskId: task.id },
                            { onSuccess: (res) => setResult(res.outcome) },
                          )
                        }
                      >
                        <Wrench className="size-3.5" /> Apply repair
                      </Action>
                    ) : null}
                    <Action tone="ghost" loading={dismissTask.isPending} onClick={() => dismissTask.mutate({ taskId: task.id, note: "dismissed by ops" })}>
                      Dismiss
                    </Action>
                  </div>
                ) : (
                  <p className="mt-2 font-mono text-[10.5px] text-muted">
                    {task.status} by {task.resolvedBy ?? "—"} · <Clock date={task.resolvedAt} />
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function AuditTrail() {
  const audit = useAudit(30);
  return (
    <Panel>
      <PanelHead kicker="Audit" title="Append-only trail" right={<Chip>{audit.data?.length ?? 0} recent</Chip>} />
      <div className="max-h-[380px] overflow-auto p-4">
        {audit.isLoading ? (
          <Loading rows={4} label="Loading audit" />
        ) : (
          <ul className="space-y-1.5">
            {(audit.data ?? []).map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 border-b border-line pb-1.5 last:border-b-0">
                <Clock date={entry.at} />
                <span className={cn("font-mono text-[11px]", entry.actor.startsWith("agent:") ? "text-violet" : entry.actor === "system" ? "text-muted" : "text-amber")}>
                  {entry.actor}
                </span>
                <span className="font-mono text-[11px] text-bone">{entry.action}</span>
                <span className="ml-auto max-w-[46%] truncate text-right font-mono text-[10.5px] text-muted">
                  {entry.entityType}:{entry.entityId} {Object.keys(entry.detail).length ? JSON.stringify(entry.detail) : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function FunnelPanel() {
  const funnel = useFunnel();
  const steps = funnel.data?.steps ?? [];
  const top = steps[0]?.count ?? 0;
  return (
    <Panel>
      <PanelHead kicker="Funnel" title="Discovery to door" right={<Chip>{funnel.data?.totalEvents ?? 0} events</Chip>} />
      <div className="space-y-3 p-4">
        {funnel.isLoading ? (
          <Loading rows={2} label="Loading funnel" />
        ) : (
          steps.map((s) => (
            <div key={s.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] text-bone">{s.label}</span>
                <span className="font-mono text-[11px] text-muted">
                  {s.count}
                  {s.conversionFromPrevious !== null ? ` · ${s.conversionFromPrevious}%` : ""}
                </span>
              </div>
              <div className="mt-1">
                <Meter value={s.count} max={top || 1} tone="violet" />
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function RoomRail() {
  const rooms = useOpsRooms();
  return (
    <Panel>
      <PanelHead kicker="Rooms" title="Live position" />
      <div className="p-4">
        {rooms.isLoading ? (
          <Loading rows={3} label="Loading rooms" />
        ) : (
          <ul className="space-y-3">
            {(rooms.data ?? []).map((r) => (
              <li key={r.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-bone">{r.name}</span>
                  <StatePill state={r.status} />
                </div>
                <div className="mt-1">
                  <Meter value={r.issued} max={r.capacity} tone="amber" />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10.5px] text-muted">
                  <span>{r.issued} issued · {r.inside} inside</span>
                  <span>{r.rejectedScans} refused at door</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

export default function OpsPage() {
  const overview = useOpsOverview();
  const seed = useSeedDemo();

  const o = overview.data;

  return (
    <div className="space-y-4">
      <section className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker tone="violet">Ops console · NOX core</Kicker>
          <h1 className="mt-1 font-display text-[40px] leading-[0.95] tracking-[0.01em] sm:text-[50px]">
            The desk that
            <br />
            <span className="text-amber">answers for the door.</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Action tone="ghost" loading={seed.isPending} onClick={() => seed.mutate(undefined)}>
            <RefreshCw className="size-3.5" /> Reset demo night
          </Action>
        </div>
      </section>

      {seed.data ? (
        <Notice tone="violet">
          Seeded {seed.data.rooms} rooms, {seed.data.orders} orders. Deliberately inconsistent rows for the agents to
          catch: {seed.data.planted.join(" · ")}
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Awaiting payment" value={o?.orders.awaiting ?? "—"} sub="holds with a clock" />
        <Stat label="In verification" value={o?.orders.submitted ?? "—"} sub="needs a human" tone="amber" />
        <Stat label="Verified" value={o?.orders.verified ?? "—"} sub="credentials issued" tone="success" />
        <Stat label="Rejected" value={o?.orders.rejected ?? "—"} sub="proof did not pass" tone="danger" />
        <Stat label="Expired" value={o?.orders.expired ?? "—"} sub="inventory released" />
        <Stat label="Inside now" value={o?.inside ?? "—"} sub={`${o?.ticketsIssued ?? 0} live credentials`} tone="violet" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Verified value" value={<Money amount={o?.verifiedValueMmk ?? 0} className="font-display" />} sub="MMK, manual verification" />
        <Stat label="Flagged payments" value={o?.flaggedPayments ?? "—"} sub="reused transaction IDs" tone="danger" />
        <Stat label="Open agent tasks" value={o?.openTasks ?? "—"} sub={`${o?.criticalViolations ?? 0} critical violations`} tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <VerificationQueue />
          <AgentDesk />
        </div>
        <div className="space-y-4">
          <CoherenceMonitor />
          <RoomRail />
          <FunnelPanel />
        </div>
      </div>

      <AuditTrail />
    </div>
  );
}
