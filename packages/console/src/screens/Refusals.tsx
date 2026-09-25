import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, DataTable, Modal, Segmented, Sheet, Tag, useNotify } from "cordon-ui";
import { ENFORCED_BY, REASON_MEANING, formatUsdc } from "@cordon/fixtures";
import { CHAIN, explorerFor } from "../lib/chain";
import { useTitle } from "../parts/Shell";
import { PageHeader, PageSkeleton, Panel, ReadFailed } from "../parts/Page";
import { useConsoleTree } from "../lib/useConsoleTree";
import { usePurposes } from "../lib/purpose";
import { useAgentNames } from "../lib/names";
import { useChainRefusals, type ChainRefusal } from "../lib/refusals";
import { useRelease } from "../lib/mandate";
import { cutLookup, shortId, shortPurpose } from "../lib/format";
import { site } from "../lib/links";

type Filter = "all" | "standing" | "released";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail__row">
      <dt className="detail__label">{label}</dt>
      <dd className="detail__value">{children}</dd>
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a className="mono" href={explorerFor.tx(hash)} target="_blank" rel="noreferrer">
      {shortId(hash, 8, 6)} ↗
    </a>
  );
}

export default function Refusals() {
  useTitle("Refusals · Cordon console");
  const { ready, mine, owner, chain, nodes, root } = useConsoleTree();
  const live = useChainRefusals(
    nodes.map((node) => node.node),
    root?.node ?? null,
  );
  const purposes = usePurposes(nodes.map((node) => node.node));
  const names = useAgentNames(nodes.map((node) => node.operator));
  /* Its name, then what it said it was for, then its id — the same order every
     screen here uses, because a reader who learns one learns all of them. */
  const called = (node: string) => {
    const match = nodes.find((n) => n.node.toLowerCase() === node.toLowerCase());
    return (match && names.of(match.operator)) ?? purposes.of(node);
  };
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [releasing, setReleasing] = useState<ChainRefusal | null>(null);
  const { state, release } = useRelease(owner);
  const notify = useNotify();
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (state.status !== "done" && state.status !== "failed") return;
    const id = `release:${state.status === "done" ? state.hash : state.why}`;
    if (seen.current === id) return;
    seen.current = id;
    if (state.status === "done") {
      notify({ id, tone: "caution", title: "Refusal released", children: "The money is with the agent's operator. When the agent asks for that purchase again, it is paid from this release with no new draw. The bound did not move.", duration: 9000 });
      setReleasing(null);
      window.setTimeout(() => window.location.reload(), 1400);
    } else {
      notify({ id, tone: "critical", title: "Not released", children: state.why, duration: 0 });
    }
  }, [state, notify]);

  const selectedId = params.get("id");
  const select = (id: bigint | null) => {
    const next = new URLSearchParams(params);
    if (id !== null) next.set("id", String(id));
    else next.delete("id");
    setParams(next, { replace: true });
  };

  if (!ready || chain.state === "looking" || live.state === "looking") return <PageSkeleton />;
  if (chain.state === "failed") return <ReadFailed why={chain.why} />;
  if (live.state === "failed") return <ReadFailed why={live.why} />;
  if (live.state !== "read") return <ReadFailed title="No deployment configured" why="This build has no contract addresses to read." />;

  const isCut = cutLookup(nodes);
  const all = live.refusals;
  const standing = all.filter((refusal) => !refusal.released).length;
  const rows = all.filter((refusal) =>
    filter === "all" ? true : filter === "standing" ? !refusal.released : refusal.released,
  );
  const selected = all.find((refusal) => String(refusal.id) === selectedId);
  const partial = live.total > all.length || Boolean(live.from);
  const working = state.status === "working";

  return (
    <div className="stack">
      <PageHeader
        title="Refusals"
        subtitle={
          all.length === 0
            ? "Nothing has been refused. Every purchase so far fit every bound."
            : `${standing} standing · ${all.length - standing} released. Each one is a decision the contract made, not an error.`
        }
      />

      {partial ? (
        <p className="inline-note">
          {live.from
            ? `Read from the chain back to block ${String(live.from)}; older refusals are not shown.`
            : `Showing the ${all.length} most recent of ${live.total}.`}
        </p>
      ) : null}

      <div className="toolbar">
        <Segmented
          size="sm"
          label="Filter refusals"
          value={filter}
          onValueChange={(value) => setFilter(value as Filter)}
          options={[
            { value: "all", label: `All ${all.length}` },
            { value: "standing", label: `Standing ${standing}` },
            { value: "released", label: `Released ${all.length - standing}` },
          ]}
        />
      </div>

      <Panel flush>
        <DataTable
          rows={rows}
          rowKey={(refusal) => String(refusal.id)}
          onRowClick={(refusal) => select(refusal.id)}
          empty={<p className="muted table-empty">No refusals here.</p>}
          columns={[
            { id: "id", header: "#", width: 64, cell: (refusal) => <span className="mono muted">{String(refusal.id)}</span> },
            {
              id: "amount",
              header: "Amount",
              numeric: true,
              sortBy: (refusal) => Number(refusal.amount6),
              cell: (refusal) => <span className="num strong">{formatUsdc(refusal.amount6)}</span>,
            },
            { id: "reason", header: "Bound", cell: (refusal) => <span className="mono">{refusal.reason}</span> },
            {
              id: "agent",
              header: "Agent",
              /* Who was refused, said the way the rest of the console says it:
                 "Cheap-source probe" and not `0x08bd7e…`. This is the table a
                 stranger reads to decide whether the refusals are real, and a
                 column of hexadecimal tells them nothing about which agent
                 kept hitting which bound. */
              cell: (refusal) => {
                const said = called(refusal.node);
                return said ? (
                  <span className="cell-stack">
                    <span>{shortPurpose(said)}</span>
                    <span className="mono small muted">{shortId(refusal.node)}</span>
                  </span>
                ) : (
                  <span className="mono muted">{shortId(refusal.node)}</span>
                );
              },
            },
            {
              id: "status",
              header: "Status",
              cell: (refusal) =>
                refusal.released ? <Tag tone="caution" size="sm" dot>Released</Tag> : <Tag size="sm" dot>Standing</Tag>,
            },
            {
              id: "published",
              header: "Published",
              cell: (refusal) =>
                refusal.attested ? (
                  <span className="small">Registry</span>
                ) : refusal.attested === null ? (
                  <span className="small muted">No</span>
                ) : (
                  <span className="small muted">—</span>
                ),
            },
            ...(mine
              ? [
                  {
                    id: "action",
                    header: "",
                    width: 96,
                    cell: (refusal: ChainRefusal) =>
                      refusal.released ? null : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            setReleasing(refusal);
                          }}
                        >
                          Release
                        </Button>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </Panel>

      <Sheet
        open={Boolean(selected)}
        onClose={() => select(null)}
        side="right"
        size={460}
        title={selected ? `Refusal #${String(selected.id)}` : "Refusal"}
        description={selected ? `Block ${String(selected.blockNumber)} · ${CHAIN.name}` : undefined}
        footer={
          mine && selected && !selected.released ? (
            <Button variant="danger" onClick={() => setReleasing(selected)}>
              Release this purchase
            </Button>
          ) : undefined
        }
      >
        {selected ? (
          <div className="detail">
            <div className="detail__summary">
              <div className="detail__flags">
                {selected.released ? <Tag tone="caution" size="sm" dot>Released</Tag> : <Tag size="sm" dot>Standing</Tag>}
                {isCut(selected.node) ? <Tag tone="critical" size="sm">Branch revoked</Tag> : null}
              </div>
              <p className="detail__big num">{formatUsdc(selected.amount6)}</p>
              <p className="detail__note">
                Refused by <span className="mono">{selected.reason}</span> — {REASON_MEANING[selected.reason] ?? "an unrecognised bound"}.
              </p>
            </div>
            <dl className="detail__list">
              <Fact label="Agent"><span className="mono breakable">{selected.node}</span></Fact>
              <Fact label="Bound hit at"><span className="mono">{shortId(selected.breachedAt)}</span></Fact>
              <Fact label="Seller"><span className="mono breakable">{selected.counterparty}</span></Fact>
              <Fact label="Transaction"><TxLink hash={selected.transactionHash} /></Fact>
              <Fact label="Published">
                {selected.attested ? <TxLink hash={selected.attested} /> : selected.attested === null ? "Not published" : "Unknown from this read"}
              </Fact>
              <Fact label="Public record">
                <a href={site(`/refusal/${selected.id}`)} target="_blank" rel="noreferrer">
                  getcordon.xyz/refusal/{String(selected.id)} ↗
                </a>
              </Fact>
            </dl>
            <p className="detail__fn mono">{ENFORCED_BY.refusal}</p>
          </div>
        ) : null}
      </Sheet>

      <Modal
        open={Boolean(releasing)}
        onClose={working ? () => undefined : () => setReleasing(null)}
        title={releasing ? `Release ${formatUsdc(releasing.amount6)}?` : "Release"}
        description="This moves the refused amount to that agent's operator, from your own key. The next time the agent asks for the same purchase, the daemon pays it out of this release with no new draw — once. The bound does not move, and both the refusal and the release stay on the record."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReleasing(null)} disabled={working}>
              Leave it refused
            </Button>
            <Button variant="danger" loading={working} disabled={working || !releasing} onClick={() => releasing && void release(releasing.id)}>
              {state.status === "working" ? state.step : "Sign release"}
            </Button>
          </>
        }
      >
        {releasing && isCut(releasing.node) ? (
          <p className="accent-text">
            This agent's branch is revoked. Releasing still pays its operator, because the vault checks the owner and not the revocation.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
