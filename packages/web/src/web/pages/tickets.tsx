import { Link } from "wouter";
import { useMyTickets } from "../queries/tickets";
import { Action, Chip, Clock, Empty, Kicker, Loading, Money, Panel, PanelHead, Row, StatePill } from "../components/nox";

export default function CredentialsPage() {
  const tickets = useMyTickets();
  const list = tickets.data ?? [];

  return (
    <div className="space-y-4">
      <section className="reveal">
        <Kicker tone="violet">Credentials · holder view</Kicker>
        <h1 className="mt-1 font-display text-[40px] leading-[0.95] tracking-[0.01em] sm:text-[50px]">
          What the door
          <br />
          <span className="text-amber">will accept.</span>
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          Each credential below is a signed token tied to a ticket row. The QR is rendered by this server; the door
          checks the signature, then the row, then whether anyone has already walked in on it.
        </p>
      </section>

      {tickets.isLoading ? (
        <Loading rows={3} label="Loading credentials" />
      ) : list.length === 0 ? (
        <Empty
          title="No credentials yet"
          hint="Buy a ticket and get it verified — issued credentials show up here with their QR."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((t, i) => (
            <Panel
              key={t.id}
              tone={t.status === "ISSUED" ? "success" : t.status === "SCANNED" ? "violet" : "danger"}
              className="reveal"
            >
              <PanelHead
                kicker={`${t.event.venue} · ${t.event.window}`}
                title={t.event.name}
                right={<StatePill state={t.status} />}
              />
              <div className="flex flex-col gap-4 p-4 sm:flex-row">
                <div className="mx-auto w-[168px] shrink-0 rounded-sm border border-line bg-bone p-2 sm:mx-0">
                  <div className="qr-svg" dangerouslySetInnerHTML={{ __html: t.qrSvg }} />
                </div>
                <div className="min-w-0 flex-1">
                  <Row label="Holder">{t.holder}</Row>
                  <Row label="Tier">{t.tier} · <Money amount={t.priceMmk} className="text-[12px]" /></Row>
                  <Row label="Order" mono>{t.orderRef ?? "—"}</Row>
                  <Row label="Seat">{t.seq} of the order</Row>
                  <Row label="Issued" mono><Clock date={t.issuedAt} /></Row>
                  <Row label="Scanned" mono><Clock date={t.scannedAt} /></Row>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.status === "ISSUED" ? <Chip tone="success">valid once</Chip> : null}
                    {t.status === "SCANNED" ? <Chip tone="violet">already inside</Chip> : null}
                    {t.status === "VOID" ? <Chip tone="danger">voided by ops</Chip> : null}
                    <Chip>{t.event.area}</Chip>
                  </div>
                </div>
              </div>
              <div className="border-t border-line px-4 py-3">
                <Kicker className="mb-1.5">Token</Kicker>
                <code className="block break-all font-mono text-[10.5px] leading-relaxed text-muted">{t.token}</code>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Panel className="p-4">
        <Kicker tone="violet">Why the token matters</Kicker>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted">
          The token is HMAC-signed with a server secret, so it cannot be invented or edited. It is also not enough on
          its own: the door re-reads the ticket row and the order behind it, which is how a credential on a rejected
          payment gets stopped even though its signature is perfectly valid.
        </p>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Link to="/">
          <Action tone="ghost">Find another room</Action>
        </Link>
        <Link to="/door">
          <Action tone="ghost">Open the door scanner</Action>
        </Link>
      </div>
    </div>
  );
}
