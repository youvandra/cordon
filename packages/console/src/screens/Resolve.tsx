import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Enforced, Tag, TextField } from "cordon-ui";
import { SEPOLIA, formatUsdc, shortAddress } from "@cordon/fixtures";
import { useTitle } from "../parts/Shell";
import { PageHeader, Panel, ReadFailed } from "../parts/Page";
import { useResolvedAgent, type Rung } from "../lib/resolveName";
import { shortId } from "../lib/format";

/**
 * Looking an agent up by name — the one screen here that belongs to a stranger.
 *
 * Every other surface in this console answers to an owner who already knows
 * their tree. This one answers the question a seller has and has never had a
 * way to ask: an agent is about to call me, may it pay, and who is behind it.
 *
 * The distinction the layout has to carry is which answers are enforced and
 * which are claimed. The bound, the liveness and the headroom come from the
 * contract and carry the `.enforced` badge this project uses everywhere. The
 * endpoint and the description come from text records, are the owner's own
 * words, and say so.
 */
/** Where a reader can go and check any of this for themselves. */
const ENS_APP = "https://manager.ens.dev";

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="mono breakable" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail__row">
      <dt className="detail__label">{label}</dt>
      <dd className="detail__value">{children}</dd>
    </div>
  );
}

/**
 * The authority chain, leaf at the top.
 *
 * Worth drawing rather than listing, because it answers "who can cut this
 * agent off" by showing the answer rather than asserting it: every rung above
 * an agent is an operator who can, and the owner at the end is the person who
 * funded the whole tree.
 */
function Chain({ rungs, owner, boundBy }: { rungs: Rung[]; owner: string; boundBy: string | null }) {
  return (
    <ol className="chain">
      {rungs.map((rung) => (
        <li key={rung.node} className="chain__rung" data-self={rung.self ? "" : undefined}>
          <span className="chain__mark" aria-hidden="true" />
          <div className="chain__body">
            <p className="chain__title">
              {rung.self ? "this agent" : rung.depth === 0 ? "the root" : `depth ${rung.depth}`}
              {boundBy === rung.node ? <Tag tone="caution">the binding limit</Tag> : null}
            </p>
            <p className="chain__meta mono">
              {shortId(rung.node)} · operator {shortAddress(rung.operator)} · {formatUsdc(rung.budget6)}
            </p>
          </div>
        </li>
      ))}
      <li className="chain__rung chain__rung--owner">
        <span className="chain__mark" aria-hidden="true" />
        <div className="chain__body">
          <p className="chain__title">the owner</p>
          <p className="chain__meta mono">{shortAddress(owner)}</p>
          <p className="chain__note">
            Funded this tree, and the only account that can cut any branch of it.
          </p>
        </div>
      </li>
    </ol>
  );
}

export default function Resolve() {
  useTitle("Resolve an agent · Cordon");
  const [params, setParams] = useSearchParams();
  const asked = params.get("q") ?? "";
  const [typed, setTyped] = useState(asked);
  const lookup = useResolvedAgent(asked);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setParams(typed.trim() ? { q: typed.trim() } : {}, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Resolve an agent"
        subtitle={
          <>
            A name, or the address in a payment. The name says which contract to
            ask; the contract says what the agent may still spend. On {SEPOLIA.name},
            where ENSv2 lives.
          </>
        }
      />

      <Panel>
        <form className="resolve__form" onSubmit={submit}>
          <TextField
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="sentinel.mira.eth"
            iconStart="search"
            aria-label="An agent's ENS name or address"
            size="lg"
          />
          <Button type="submit" variant="primary" size="lg">
            Look it up
          </Button>
        </form>
      </Panel>

      {lookup.state === "looking" ? <Panel><p className="muted">Asking ENS, then the contract.</p></Panel> : null}

      {lookup.state === "failed" ? <ReadFailed why={lookup.why} /> : null}

      {lookup.state === "unnamed" ? (
        <Panel title="Nothing here can be verified">
          <p>
            <span className="mono">{lookup.subject}</span> has no name that resolves
            back to it. Either it never had one, or the name it had has stopped
            resolving — because it was unregistered, or because a name above it
            was. ENS gives the same answer to all three.
          </p>
          <p className="muted">A seller whose gate is this lookup refuses here, before serving.</p>
        </Panel>
      ) : null}

      {lookup.state === "unbound" ? (
        <Panel title="A name, and no bound">
          <p>
            <span className="mono">{lookup.name}</span> resolves to{" "}
            <span className="mono">{shortAddress(lookup.address)}</span> and publishes
            no mandate. It says nothing about what it may spend, so there is nothing
            to check it against.
          </p>
        </Panel>
      ) : null}

      {lookup.state === "found" ? (
        <>
          <Panel
            title={lookup.agent.name}
            action={
              <span className="resolve__badges">
                {lookup.agent.live ? (
                  <Tag tone="positive">live</Tag>
                ) : (
                  <Tag tone="critical">cut</Tag>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    window.open(`${ENS_APP}/${lookup.agent.name}`, "_blank", "noreferrer")
                  }
                >
                  Open in ENS
                </Button>
              </span>
            }
          >
            <dl className="detail">
              <Fact label="Address">
                <Out href={`${SEPOLIA.explorer}/address/${lookup.agent.address}`}>
                  {lookup.agent.address}
                </Out>
              </Fact>
              <Fact label="Budget">
                <Enforced>{formatUsdc(lookup.agent.budget6)}</Enforced>
              </Fact>
              {lookup.agent.headroom6 !== null ? (
                <Fact label="May still draw">
                  <Enforced>{formatUsdc(lookup.agent.headroom6)}</Enforced>
                </Fact>
              ) : null}
              {lookup.agent.cutAt ? (
                <Fact label="Cut at">
                  <span className="mono">{shortId(lookup.agent.cutAt)}</span>
                  {lookup.agent.cutAt === lookup.agent.node ? " — this node" : " — an ancestor"}
                </Fact>
              ) : null}
              <Fact label="Mandate">
                <span className="mono">{shortId(lookup.agent.node)}</span>
                <span className="muted"> in </span>
                <Out href={`${SEPOLIA.explorer}/address/${lookup.agent.registry}`}>
                  {shortAddress(lookup.agent.registry)}
                </Out>
              </Fact>
              <Fact label="Identity">
                {lookup.agent.agentId === null ? (
                  <span className="muted">bound to no ERC-8004 agent</span>
                ) : (
                  <>
                    <span className="mono">{String(lookup.agent.agentId)}</span>{" "}
                    {lookup.agent.attested ? (
                      <Tag tone="positive">the name attests to it</Tag>
                    ) : (
                      <Tag tone="critical">the name does not attest to it</Tag>
                    )}
                  </>
                )}
              </Fact>
            </dl>
          </Panel>

          <Panel title="Who can cut it off">
            <Chain
              rungs={lookup.agent.chain}
              owner={lookup.agent.owner}
              boundBy={lookup.agent.boundBy}
            />
          </Panel>

          {lookup.agent.endpoint || lookup.agent.context ? (
            <Panel title="What it says about itself">
              <p className="muted">
                Text records, written by the owner of the name. No contract reads
                them and nothing here enforces them.
              </p>
              <dl className="detail">
                {lookup.agent.endpoint ? (
                  <Fact label="Endpoint">
                    <span className="mono">{lookup.agent.endpoint}</span>
                  </Fact>
                ) : null}
                {lookup.agent.context ? <Fact label="Context">{lookup.agent.context}</Fact> : null}
              </dl>
            </Panel>
          ) : null}
        </>
      ) : null}
    </>
  );
}
