import { useEffect, useState } from "react";
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
import { verify, type Result, type Verified } from "@cordon/verify";
import {
  chainFacts,
  DEPLOYMENTS,
  ENSV2,
  formatUsdc,
  SEPOLIA,
  shortAddress,
  shortId,
} from "@cordon/fixtures";
import { RecordShell } from "../parts/RecordShell";

/**
 * /resolve — the seller's question, on the public site.
 *
 * A stranger holds an agent's name, or the address in a payment, and nothing
 * else: no wallet, no relationship, no account. This answers what the console
 * has answered for a while, but from the front door rather than from a room
 * named "Console" that reads as the owner's.
 *
 * The check itself is `@cordon/verify` — the package a seller integrates —
 * rather than a second copy. A page that resolved a name its own way would be
 * a surface that can disagree with the one a seller actually runs.
 */
const facts = chainFacts(SEPOLIA.chainId)!;

/**
 * The chain, as a literal.
 *
 * `viem` arrives with `@cordon/verify`, which this page loads on demand, so it
 * is not named here — the fields below are the only ones the resolver reads.
 */
const CHAIN = {
  id: facts.chainId,
  name: facts.name,
  nativeCurrency: { name: facts.nativeName, symbol: facts.nativeSymbol, decimals: facts.nativeDecimals },
  rpcUrls: { default: { http: [facts.rpc] } },
  blockExplorers: { default: { name: "explorer", url: facts.explorer } },
} as const;

const VAULT = DEPLOYMENTS[SEPOLIA.chainId]?.vault as `0x${string}` | undefined;

type Lookup =
  | { state: "idle" }
  | { state: "looking" }
  | { state: "done"; subject: string; result: Result };

function useLookup(subject: string): Lookup {
  const [state, setState] = useState<Lookup>({ state: "idle" });

  useEffect(() => {
    const asked = subject.trim();
    if (!asked) {
      setState({ state: "idle" });
      return;
    }
    let live = true;
    setState({ state: "looking" });
    verify(asked, {
      chain: CHAIN,
      rpcUrl: facts.rpc,
      universalResolver: ENSV2.universalResolver as `0x${string}`,
      vault: VAULT,
    })
      .then((result) => {
        if (live) setState({ state: "done", subject: asked, result });
      })
      .catch((error: unknown) => {
        if (live) {
          setState({
            state: "done",
            subject: asked,
            result: { ok: false, reason: "failed", why: (error as Error).message },
          });
        }
      });
    return () => {
      live = false;
    };
  }, [subject]);

  return state;
}

/** The answers a seller acts on, and where each came from. */
function Found({ agent }: { agent: Verified }) {
  return (
    <Card>
      <CardBody>
        <Stack direction="column" gap="sm" align="start">
          <Stack direction="row" gap="sm" align="center" wrap>
            <Tag tone={agent.live ? "positive" : "critical"} size="sm" dot>
              {agent.live ? "live" : "cut"}
            </Tag>
            <Text variant="body" tone="ink" as="span" className="mono">
              {agent.name}
            </Text>
          </Stack>

          <Text variant="body" tone="copy" as="p">
            Operator <span className="mono">{shortAddress(agent.address)}</span>, the key that
            signs for it. It holds no money: the vault releases one purchase at a time.
          </Text>

          {agent.headroom6 !== null ? (
            <Text variant="body" tone="copy" as="p">
              May still draw <Enforced>{formatUsdc(agent.headroom6)}</Enforced>
              {agent.boundBy ? (
                <>
                  {" "}
                  — held by <span className="mono">{shortId(agent.boundBy)}</span>, often an
                  ancestor rather than this agent.
                </>
              ) : null}
            </Text>
          ) : (
            <Text variant="body" tone="copy" as="p">
              Headroom is not answered here: no vault is configured for this build.
            </Text>
          )}

          <Text variant="body" tone="copy" as="p">
            Owner <span className="mono">{shortAddress(agent.owner)}</span> — funded the tree
            and is the only account that can cut it. Depth {agent.depth}.
            {agent.revokedAt ? (
              <>
                {" "}
                Cut at <span className="mono">{shortId(agent.revokedAt)}</span>.
              </>
            ) : null}
          </Text>

          <Text variant="micro" tone="dim" as="p">
            {agent.nameAgrees === null
              ? "The name carries no computed record of its own; every figure above is the contract's."
              : agent.nameAgrees
                ? "The name's own computed record agrees with the contract."
                : "The name and the contract disagree. The contract is the one to believe."}
          </Text>

          {agent.endpoint ? (
            <Text variant="micro" tone="dim" as="p">
              Endpoint <span className="mono">{agent.endpoint}</span> — the owner's own words,
              enforced by nothing.
            </Text>
          ) : null}
        </Stack>
      </CardBody>
    </Card>
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
  const lookup = useLookup(asked);

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
            A name, or the address in a payment. The name says which contract to ask; the
            contract says what this agent may still draw, and who can cut it off. No wallet,
            no account, no permission from us.
          </Text>
        </header>

        <Card>
          <CardBody>
            <form className="resolve__form" onSubmit={submit}>
              <TextField
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="worker1.probe.mira.eth, or 0x…"
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
          <Notice title="Asking ENS, then the contract.">
            A resolver, then a registry read, then the vault.
          </Notice>
        ) : null}

        {lookup.state === "done" && lookup.result.ok ? <Found agent={lookup.result.agent} /> : null}

        {lookup.state === "done" && !lookup.result.ok && lookup.result.reason === "unnamed" ? (
          <Notice title="Nothing here can be verified.">
            <span className="mono">{lookup.result.subject}</span> has no name that resolves back
            to it. Either it never had one, or the name it had has stopped resolving — because
            it was unregistered, or because a name above it was. ENS answers all three the same
            way. A seller whose gate is this lookup refuses here, before serving.
          </Notice>
        ) : null}

        {lookup.state === "done" && !lookup.result.ok && lookup.result.reason === "unbound" ? (
          <Notice title="A name, and no bound.">
            <span className="mono">{lookup.result.name}</span> resolves to{" "}
            <span className="mono">{shortAddress(lookup.result.address)}</span> and publishes no
            mandate. It says nothing about what it may spend, so there is nothing to check it
            against.
          </Notice>
        ) : null}

        {lookup.state === "done" && !lookup.result.ok && lookup.result.reason === "failed" ? (
          <Notice title="The lookup itself failed.">{lookup.result.why}</Notice>
        ) : null}
      </Container>
    </RecordShell>
  );
}
