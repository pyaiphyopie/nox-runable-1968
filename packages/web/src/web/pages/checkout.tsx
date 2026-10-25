import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Check, Paperclip, TriangleAlert } from "lucide-react";
import { useOrder, useAbandonOrder } from "../queries/orders";
import { useSubmitProof, uploadReceipt } from "../queries/payments";
import {
  Action,
  Chip,
  Clock,
  Field,
  Kicker,
  Loading,
  Money,
  Notice,
  Panel,
  PanelHead,
  Row,
  StatePill,
  inputClass,
} from "../components/nox";

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => setLeft(seconds), [seconds]);
  useEffect(() => {
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const m = Math.floor(left / 60);
  const s = left % 60;
  return { label: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, left };
}

export default function CheckoutPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const order = useOrder(orderId);
  const submitProof = useSubmitProof();
  const abandon = useAbandonOrder();

  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const o = order.data;
  const countdown = useCountdown(o?.holdSecondsLeft ?? 0);

  if (order.isLoading) return <Loading rows={4} label="Loading order" />;
  if (order.isError || !o) {
    return (
      <Panel tone="danger" className="p-4">
        <Kicker tone="danger">Not found</Kicker>
        <p className="mt-1 text-[13px]">That order does not exist on this server.</p>
        <Link to="/" className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.12em] text-amber">
          Back to tonight
        </Link>
      </Panel>
    );
  }

  const onPick = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const key = await uploadReceipt(file, o.ref);
      setReceiptKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    setError(null);
    submitProof.mutate(
      { orderId: o.id, payerReference: reference.trim(), payerPhone: phone.trim() || undefined, receiptUrl: receiptKey ?? undefined },
      {
        onSuccess: () => setReference(""),
        onError: (e) => setError(e instanceof Error ? e.message : "Could not submit"),
      },
    );
  };

  const awaiting = o.status === "AWAITING_PAYMENT" || o.status === "REJECTED";
  const waiting = o.status === "PROOF_SUBMITTED";

  return (
    <div className="space-y-4">
      <Link to={`/room/${o.event.id}`} className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted hover:text-bone">
        <ArrowLeft className="size-3.5" /> {o.event.name}
      </Link>

      <section className="reveal">
        <Kicker tone="violet">Checkout · {o.event.venue}</Kicker>
        <h1 className="mt-1 font-display text-[38px] leading-[0.95] tracking-[0.01em] sm:text-[48px]">
          {awaiting ? "Move the money." : waiting ? "Waiting on a human." : "Order settled."}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatePill state={o.status} />
          <Chip>{o.ref}</Chip>
          <Chip tone={countdown.left > 0 ? "amber" : "danger"}>
            {countdown.left > 0 ? `hold ${countdown.label}` : "hold lapsed"}
          </Chip>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <PanelHead kicker="Order" title={`${o.qty} × ${o.tier.name}`} right={<Money amount={o.amountMmk} className="text-[14px]" />} />
          <div className="p-4">
            <Row label="Room">{o.event.name}</Row>
            <Row label="Venue">{o.event.venue} · {o.event.area}</Row>
            <Row label="Window" mono>{o.event.window}</Row>
            <Row label="Wallet">{o.adapter.label}</Row>
            <Row label="Reference" mono>{o.ref}</Row>
            <Row label="Opened" mono><Clock date={o.createdAt} /></Row>
            <Row label="Hold expires" mono><Clock date={o.holdExpiresAt} /></Row>

            {awaiting && countdown.left === 0 ? (
              <div className="mt-3">
                <Notice tone="danger">
                  The hold has lapsed. Inventory went back on the shelf. Start again from the room.
                </Notice>
              </div>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-4">
          {awaiting ? (
            <Panel tone="amber">
              <PanelHead kicker="Pay in your wallet" title={o.adapter.handoff} />
              <div className="space-y-3 p-4">
                <div className="rounded-sm border border-line bg-panel2 px-3 py-2.5">
                  <Row label="Pay to">{o.adapter.payee}</Row>
                  <Row label="Wallet number" mono>{o.adapter.payeeAccount}</Row>
                  <Row label="Amount" mono><Money amount={o.amountMmk} /></Row>
                  <Row label="Reference to type">{o.ref}</Row>
                </div>
                <p className="text-[12px] leading-snug text-muted">
                  This screen does not open your wallet and does not charge you. Move the money in the {o.adapter.label} app,
                  then bring the transaction ID back here.
                </p>

                <Field label={o.adapter.referenceLabel}>
                  <input
                    className={inputClass}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. KBZ-7712093"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Wallet phone (optional)">
                  <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09…" />
                </Field>

                <div>
                  <Kicker className="mb-1.5">Receipt</Kicker>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onPick(f);
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Action tone="ghost" onClick={() => fileInput.current?.click()} loading={uploading}>
                      <Paperclip className="size-3.5" /> {receiptKey ? "Replace photo" : "Attach photo"}
                    </Action>
                    {receiptKey ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-success">
                        <Check className="size-3.5" /> attached
                      </span>
                    ) : (
                      <span className="font-mono text-[10.5px] text-muted">optional but speeds verification</span>
                    )}
                  </div>
                </div>

                {error ? <Notice tone="danger">{error}</Notice> : null}

                <Action
                  onClick={submit}
                  disabled={reference.trim().length < 4 || countdown.left === 0}
                  loading={submitProof.isPending}
                  className="w-full"
                >
                  Submit for verification
                </Action>

                <button
                  type="button"
                  onClick={() => abandon.mutate({ orderId: o.id })}
                  className="w-full font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted underline-offset-4 hover:text-danger hover:underline"
                >
                  Cancel and release the hold now
                </button>
              </div>
            </Panel>
          ) : null}

          {waiting ? (
            <Panel tone="violet">
              <PanelHead kicker="Verification" title="A person is checking this" />
              <div className="space-y-3 p-4">
                <Row label="Transaction ID" mono>{o.payment?.payerReference ?? "—"}</Row>
                <Row label="Submitted" mono><Clock date={o.payment?.verifiedAt ?? null} /></Row>
                <Row label="Receipt">{o.payment?.receiptUrl ? "attached" : "none"}</Row>
                <Row label="Queue">ops · verification</Row>
                <Notice tone="violet">
                  Nothing is issued until a verifier approves. You will hold a credential the moment they do — this
                  page updates itself.
                </Notice>
                {o.payment?.flags.length ? (
                  <Notice tone="danger">
                    Flagged: {o.payment.flags.join(", ")}. A reused transaction ID is the cheapest fraud there is, so it
                    is caught here rather than at the door.
                  </Notice>
                ) : null}
                <Link to={`/tickets`} className="block">
                  <Action tone="ghost" className="w-full">Watch my credentials</Action>
                </Link>
              </div>
            </Panel>
          ) : null}

          {o.status === "VERIFIED" ? (
            <Panel tone="success">
              <PanelHead kicker="Issued" title={`${o.tickets.length} credential${o.tickets.length === 1 ? "" : "s"} live`} />
              <div className="space-y-3 p-4">
                <Notice tone="success">
                  Payment verified and credentials issued. Show the QR at the door — the door validates against this
                  server, so a screenshot alone will not work twice.
                </Notice>
                <Link to="/tickets">
                  <Action tone="success" className="w-full">Open my credentials</Action>
                </Link>
              </div>
            </Panel>
          ) : null}

          {o.status === "EXPIRED" ? (
            <Panel tone="danger">
              <PanelHead kicker="Lapsed" title="This hold expired" />
              <div className="space-y-3 p-4">
                <Notice tone="danger">
                  The inventory was released back to the tier. Nothing was charged and no credential exists.
                </Notice>
                <Link to={`/room/${o.event.id}`}>
                  <Action className="w-full">Start again</Action>
                </Link>
              </div>
            </Panel>
          ) : null}

          {o.status === "REJECTED" ? (
            <Panel tone="danger">
              <PanelHead kicker="Rejected" title="The proof did not pass" />
              <div className="space-y-3 p-4">
                <Notice tone="danger">
                  <span className="inline-flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    {o.payment?.reason ?? "No reason recorded."}
                  </span>
                </Notice>
                <p className="text-[12.5px] text-muted">
                  The inventory was released. You can submit a corrected transaction ID above while the order is still
                  open.
                </p>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
