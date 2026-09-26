import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  Container,
  Enforced,
  Headline,
  Stack,
  Tag,
  Text,
  TextField,
  usePageMeta,
} from "cordon-ui";
import { chainFacts, formatUsdc, SEPOLIA, shortAddress, shortId } from "@cordon/fixtures";
/* The console's reader, reused so the public page and the console show the
   same answer — including the identity, the name compared against the chain,
   and the authority path. */
import { useResolvedAgent, type Resolved, type Rung } from "@cordon/console-resolve";
import { RecordShell } from "../parts/RecordShell";

/**
 * /resolve — the seller's question, on the public site.
 *
 * A stranger holds an agent's name, or the address in a payment, and nothing
 * else: no wallet, no account, no relationship. This answers what the console
 * answers, from the front door rather than from a room named "Console", and it
 * reads through the same code so the two cannot disagree.
 */
const EXPLORER = chainFacts(SEPOLIA.chainId)?.explorer ?? SEPOLIA.explorer;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--cordon-space-5)",
        alignItems: "baseline",
        padding: "10px 0",
        borderBottom: "1px solid var(--cordon-hairline-soft)",
        width: "100%",
      }}
    >
      <Text variant="micro" tone="dim" as="span" style={{ flex: "0 0 148px" }}>
        {label}
      </Text>
      <Text variant="caption" tone="ink" as="span" style={{ minWidth: 0 }}>
        {children}
      </Text>
    </div>
  );
}

function Link2({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="mono" href={href} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
      {children}
    </a>
  );
}

/** The authority path, leaf at the top, owner at the end. */
function Authority({ rungs, owner, boundBy }: { rungs: Rung[]; owner: string; boundBy: string | null }) {
  return (
    <Stack direction="column" gap="xs" align="start">
      {rungs.map((rung) => (
        <Text variant="body" tone="copy" as="p" key={rung.node}>
          <span className="mono">{rung.self ? "this agent" : rung.depth === 0 ? "the root" : `depth ${rung.depth}`}</span>{" "}
          · <span className="mono">{shortId(rung.node)}</span> · operator{" "}
          <span className="mono">{shortAddress(rung.operator)}</span> · {formatUsdc(rung.budget6)}
          {boundBy === rung.node ? <Tag tone="caution" size="sm">the binding limit</Tag> : null}
        </Text>
      ))}
      <Text variant="body" tone="copy" as="p">
        <span className="mono">the owner</span> · <span className="mono">{shortAddress(owner)}</span> — funded the
        tree, and the only account that can cut any branch of it.
      </Text>
    </Stack>
  );
}

function Found({ agent }: { agent: Resolved }) {
  return (
    <>
      <Card>
        <CardBody>
          <Stack direction="column" gap="xs" align="start">
            <Stack direction="row" gap="sm" align="center" wrap>
              <Tag tone={agent.live ? "positive" : "critical"} size="sm" dot>
                {agent.live ? "live" : "cut"}
              </Tag>
              <Text variant="body" tone="ink" as="span" className="mono">
                {agent.name}
              </Text>
            </Stack>

            <Fact label="Address">
              <Link2 href={`${EXPLORER}/address/${agent.address}`}>{agent.address}</Link2>
            </Fact>
            <Fact label="Budget">
              <Enforced>{formatUsdc(agent.budget6)}</Enforced>
            </Fact>
            {agent.headroom6 !== null ? (
              <Fact label="May still draw">
                <Enforced>{formatUsdc(agent.headroom6)}</Enforced>
              </Fact>
            ) : null}
            {agent.cutAt ? (
              <Fact label="Cut at">
                <span className="mono">{shortId(agent.cutAt)}</span>
                {agent.cutAt === agent.node ? " — this node" : " — an ancestor"}
              </Fact>
            ) : null}
            <Fact label="Mandate">
              <span className="mono">{shortId(agent.node)}</span> in{" "}
              <Link2 href={`${EXPLORER}/address/${agent.registry}`}>{shortAddress(agent.registry)}</Link2>
            </Fact>
            <Fact label="Identity">
              {agent.agentId === null ? (
                "bound to no ERC-8004 agent"
              ) : (
                <>
                  <span className="mono">{String(agent.agentId)}</span>{" "}
                  {agent.attested ? (
                    <Tag tone="positive" size="sm">the name attests to it</Tag>
                  ) : (
                    <Tag tone="critical" size="sm">the name does not attest to it</Tag>
                  )}
                </>
              )}
            </Fact>
          </Stack>
        </CardBody>
      </Card>

      {agent.viaEns.computed ? (
        <Card>
          <CardBody>
            <Stack direction="column" gap="xs" align="start">
              <Text variant="micro" tone="dim" as="p" className="eyebrow">
                what the name itself answered
              </Text>
              <Text variant="body" tone="copy" as="p">
                Everything above came from the contracts. These came from an ordinary ENS text lookup — the
                call every ENS library already makes — and they are not stored anywhere. This name is on a
                resolver that reads the registry and the vault while it answers, so a revocation reaches the
                namespace in the transaction that revokes it and there is no record to go stale.
              </Text>
              <dl className="kv kv--rows">
                <div>
                  <dt>cordon.live</dt>
                  <dd className="mono">{agent.viaEns.live}</dd>
                </div>
                {agent.viaEns.headroom ? (
                  <div>
                    <dt>cordon.headroom</dt>
                    <dd className="mono">{agent.viaEns.headroom}</dd>
                  </div>
                ) : null}
                {agent.viaEns.boundBy ? (
                  <div>
                    <dt>cordon.boundBy</dt>
                    <dd className="mono kv__break">{agent.viaEns.boundBy}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Agreement</dt>
                  <dd>
                    {agent.viaEns.agrees ? (
                      <Tag tone="positive" size="sm">the name and the chain agree</Tag>
                    ) : (
                      <Tag tone="critical" size="sm">the name and the chain disagree</Tag>
                    )}
                  </dd>
                </div>
              </dl>
              <Text variant="micro" tone="dim" as="p">
                Compared rather than assumed. If these ever diverge, the name is pointing at a resolver that
                stores figures instead of computing them, and the contract is the one to believe.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
          <Stack direction="column" gap="xs" align="start">
            <Text variant="micro" tone="dim" as="p" className="eyebrow">
              who can cut it off
            </Text>
            <Authority rungs={agent.chain} owner={agent.owner} boundBy={agent.boundBy} />
          </Stack>
        </CardBody>
      </Card>

      {agent.endpoint || agent.context ? (
        <Card>
          <CardBody>
            <Stack direction="column" gap="xs" align="start">
              <Text variant="micro" tone="dim" as="p" className="eyebrow">
                what it says about itself
              </Text>
              <Text variant="body" tone="copy" as="p">
                Text records, written by the owner of the name. No contract reads them and nothing here enforces
                them.
              </Text>
              {agent.endpoint ? (
                <Fact label="Endpoint">
                  <span className="mono kv__break">{agent.endpoint}</span>
                </Fact>
              ) : null}
              {agent.context ? <Fact label="Context">{agent.context}</Fact> : null}
            </Stack>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody>
        <Stack direction="column" gap="sm" align="start">
          <Text variant="body" tone="ink" as="p">
            {title}
          </Text>
          <Text variant="body" tone="copy" as="p">
            {children}
          </Text>
        </Stack>
      </CardBody>
    </Card>
  );
}

export default function Resolve() {
  usePageMeta({
    title: "Resolve an agent · Cordon",
    description:
      "A name, or the address in a payment: is this agent still permitted to spend, and who stands behind it.",
  });

  const [params, setParams] = useSearchParams();
  const asked = params.get("q") ?? "";
  const [typed, setTyped] = useState(asked);
  const lookup = useResolvedAgent(asked);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setParams(typed.trim() ? { q: typed.trim() } : {}, { replace: true });
  };

  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            ENS · {SEPOLIA.name}
          </Text>
          <Headline lines={["Ask an agent", "what it may spend."]} />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            A name, or the address in a payment. The name says which contract to ask; the contract says what
            this agent may still draw, and who can cut it off. No wallet, no account, no permission from us.
          </Text>
        </header>

        <Card>
          <CardBody>
            <form className="resolve__form" onSubmit={submit}>
              <TextField
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="trade.olivia.eth, or 0x…"
                iconStart="search"
                aria-label="An agent's ENS name or address"
                size="lg"
              />
              <Button type="submit" variant="primary" size="lg">
                Look it up
              </Button>
            </form>
          </CardBody>
        </Card>

        {lookup.state === "looking" ? (
          <Notice title="Asking ENS, then the contract.">A resolver, then a registry read, then the vault.</Notice>
        ) : null}

        {lookup.state === "found" ? <Found agent={lookup.agent} /> : null}

        {lookup.state === "unnamed" ? (
          <Notice title="Nothing here can be verified.">
            <span className="mono">{lookup.subject}</span> has no name that resolves back to it. Either it never
            had one, or the name it had has stopped resolving — because it was unregistered, or because a name
            above it was. ENS answers all three the same way. A seller whose gate is this lookup refuses here,
            before serving.
          </Notice>
        ) : null}

        {lookup.state === "unbound" ? (
          <Notice title="A name, and no bound.">
            <span className="mono">{lookup.name}</span> resolves to{" "}
            <span className="mono">{shortAddress(lookup.address)}</span> and publishes no mandate. It says
            nothing about what it may spend, so there is nothing to check it against.
          </Notice>
        ) : null}

        {lookup.state === "failed" ? <Notice title="The lookup itself failed.">{lookup.why}</Notice> : null}
      </Container>
    </RecordShell>
  );
}
