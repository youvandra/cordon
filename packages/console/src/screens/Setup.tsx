import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  CardBody,
  CardHeader,
  Cta,
  Enforced,
  Field,
  Grid,
  MetricCard,
  Select,
  Stack,
  Text,
  TextField,
} from "cordon-ui";
import { ARC, ENFORCED_BY, MANDATE, isAddress } from "@cordon/fixtures";
import { ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";
import { useEntrance } from "../lib/entrance";
import { useWallet } from "../lib/wallet";
import { REGISTRY, useOpenMandate } from "../lib/mandate";

/**
 * Dollars as typed, in USDC base units.
 *
 * The fields are free text and people type decimals into money. Rounding to
 * the millionth is the token's own precision; anything finer is not a smaller
 * amount, it is an amount USDC cannot express.
 */
function usdc6(dollars: string): bigint {
  const value = Number(dollars || "0");
  if (!Number.isFinite(value) || value < 0) return 0n;
  return BigInt(Math.round(value * 1_000_000));
}

const WINDOWS = [
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
];

export default function Setup() {
  useTitle("Setup · Cordon console");
  const animate = useEntrance();
  const navigate = useNavigate();

  const [budget, setBudget] = useState(String(MANDATE.budget6 / 1_000_000n));
  const [windowS, setWindowS] = useState(String(MANDATE.windowSeconds));
  const [depth, setDepth] = useState(String(MANDATE.maxDepth));
  const [tranche, setTranche] = useState(String(MANDATE.tranche6 / 1_000_000n));
  const [concentration, setConcentration] = useState(
    String(MANDATE.concentrationBoundPct),
  );
  const [lifetime, setLifetime] = useState(String(MANDATE.lifetimeCap6 / 1_000_000n));
  const [signed, setSigned] = useState(false);
  /* The root's operator, and it is not the owner. The owner signs the mandate
     and then never touches it again; the operator is the daemon key that
     submits every draw. Defaulting this to the connected address would open a
     mandate no daemon can act for, and the mistake would only surface at the
     first purchase. */
  /* `cordon init` prints a link with the root operator already in it, because
     the alternative is copying a 42-character string into the right field and
     that is where people paste the wrong thing. Only ever a default: the field
     stays editable, and a link cannot sign anything. */
  const [params] = useSearchParams();
  const suggested = params.get("operator") ?? "";
  const [operator, setOperator] = useState(isAddress(suggested) ? suggested : "");

  /* Real only when there is a key behind the gate and a registry to send to.
     Either missing and this screen stays the drawing it has always been —
     which it says on itself, rather than looking like it did something. */
  const { address, real } = useWallet();
  const { state, open } = useOpenMandate(address);
  const live = real && Boolean(REGISTRY) && Boolean(address);
  /* An address that is not one is the commonest way to open a mandate nobody
     can use, and the contract rejects the zero address but not a typo. The
     amounts are checked here too: the contract refuses a zero budget and a
     zero lifetime cap, and finding that out costs a transaction. */
  const ready =
    live &&
    isAddress(operator) &&
    usdc6(budget) > 0n &&
    usdc6(lifetime) > 0n &&
    usdc6(tranche) > 0n;

  const sign = () => {
    if (!live) {
      setSigned(true);
      return;
    }
    /* USDC has six decimals and these fields are dollars, so a typed "1.5" is
       1,500,000 base units — and `BigInt("1.5")` throws, which before this was
       an uncaught exception on a button click. */
    void open({
      operator: operator as `0x${string}`,
      budget6: usdc6(budget),
      lifetimeCap6: usdc6(lifetime),
      windowSeconds: BigInt(windowS),
      trancheCap6: usdc6(tranche),
      /* Basis points are an integer on chain. `35.55 * 100` is
         3555.0000000000005 in binary floating point, and viem rejects it. */
      concentrationBps: Math.round(Number(concentration || "0") * 100),
      maxDepth: Number(depth),
    });
  };

  /* One card, rendered before the signature as a preview and after it as the
     result. Written twice it drifts, and a preview that disagrees with the
     thing it previewed is the worst version of this screen. */
  const commitment = (
    <MetricCard
      animate={animate}
      title={
        <>
          What the signature commits
          <br />
          Root window budget
        </>
      }
      value={budget || "0"}
      unit="USDC"
      progress={Math.min(1, Number(tranche) / Math.max(1, Number(budget)))}
      caption={
        <>
          per {Number(windowS).toLocaleString()}s
          <br />
          across the whole tree
          <br />
          {/* The window is a rate. Without the total beside it, a reader
              signing $20 a day believes they have signed $20. */}
          ${lifetime || "0"} in total, and it never resets
        </>
      }
      glaze="violet"
    />
  );

  return (
    <>
      <ScreenHead
        title="Sign one mandate. Fund the vault once."
        lede="Children are created by their parent, in seconds, while you sleep. The contract refuses a child wider than its parent, so no per-spawn approval is needed, and none would be safe to ask for."
        note={live ? `signs on ${ARC.name}, from your own key` : "nothing is signed or sent"}
      />

      <Grid columns={2} min={340} gap="lg" align="start">
        {/* Controls are wells pressed into paper; the card is the paper. */}
        <Card>
          <CardHeader>
            <Stack
              direction="row"
              justify="between"
              align="baseline"
              gap="md"
              wrap
            >
              <Text variant="micro" tone="dim" as="span" className="eyebrow">
                the mandate
              </Text>
            </Stack>
          </CardHeader>
          <CardBody>
            <Stack direction="column" gap="lg">
              <Field
                label="Root budget · per window"
                hint={`${ENFORCED_BY.budget} · USDC, 6 dp view`}
              >
                <TextField
                  type="number"
                  value={budget}
                  prefix="$"
                  onChange={(event) => setBudget(event.target.value)}
                />
              </Field>

              <Field
                label="Lifetime cap · total"
                hint={`${ENFORCED_BY.lifetime} · the whole mandate, and it never resets`}
              >
                <TextField
                  type="number"
                  value={lifetime}
                  prefix="$"
                  onChange={(event) => setLifetime(event.target.value)}
                />
              </Field>

              <Field
                label="Window"
                hint="the same at every depth. A shorter child window resets faster than the parent it charges"
              >
                <Select
                  options={WINDOWS}
                  value={windowS}
                  onValueChange={setWindowS}
                />
              </Field>

              <Field label="Maximum depth" hint={ENFORCED_BY.depth}>
                <TextField
                  type="number"
                  value={depth}
                  onChange={(event) => setDepth(event.target.value)}
                />
              </Field>

              <Field
                label="Tranche cap"
                hint={`${ENFORCED_BY.tranche} · bounded below by settlement cost`}
              >
                <TextField
                  type="number"
                  value={tranche}
                  prefix="$"
                  onChange={(event) => setTranche(event.target.value)}
                />
              </Field>

              {/* Not "root operator", which is the contract's word for it, and
                  not "agent address", which is the one thing it must never say:
                  the agent holds no key at all, and a field claiming otherwise
                  contradicts the product on the product's own screen. What it
                  is, in the plainest true words, is the address that does the
                  spending. */}
              <Field
                label="The address that spends"
                hint="made by `cordon init` and held by the daemon — not your wallet. You sign the limit; this spends inside it. The contract calls it the root operator"
              >
                <TextField
                  value={operator}
                  placeholder="0x…"
                  onChange={(event) => setOperator(event.target.value)}
                />
              </Field>

              <Field
                label="Counterparty concentration bound"
                hint={`${ENFORCED_BY.concentration} · percent of one window to a single declared payTo`}
              >
                <TextField
                  type="number"
                  value={concentration}
                  suffix="%"
                  onChange={(event) => setConcentration(event.target.value)}
                />
              </Field>

              <Cta
                magnetic
                hint={
                  live
                    ? "a transaction on Arc, from the owner's own key"
                    : "preview — nothing is signed or sent"
                }
                onClick={sign}
                disabled={live && !ready}
              >
                {state.status === "signing" ? "Waiting for your signature…" : "Sign mandate"}
              </Cta>

              {live && !ready ? (
                <Text variant="micro" tone="dim" as="p">
                  {isAddress(operator)
                    ? "a budget, a lifetime cap and a tranche cap all have to be more than zero"
                    : "the address that spends is needed before this can be signed"}
                </Text>
              ) : null}
              {state.status === "failed" ? (
                <Text variant="micro" tone="accent" as="p">
                  {state.why}
                </Text>
              ) : null}
              {state.status === "sent" ? (
                <Text variant="micro" tone="dim" as="p">
                  sent, waiting for the receipt ·{" "}
                  <a href={`${ARC.explorer}/tx/${state.hash}`} target="_blank" rel="noreferrer" className="mono">
                    {state.hash.slice(0, 10)}…
                  </a>
                </Text>
              ) : null}
              {state.status === "open" ? (
                <Text variant="micro" tone="ink" as="p">
                  open ·{" "}
                  <span className="mono">{state.node.slice(0, 14)}…</span> ·{" "}
                  <a href={`${ARC.explorer}/tx/${state.hash}`} target="_blank" rel="noreferrer" className="mono">
                    the transaction
                  </a>
                </Text>
              ) : null}
            </Stack>
          </CardBody>
        </Card>

        <Stack direction="column" gap="lg">
          {/* What leads this column depends on where the reader is in the task.
              Before signing, the most useful thing is a preview of what the
              signature commits. After, it is the result — at the top, because
              that is where the eye already is, and hunting for the outcome of
              your own click is the commonest way to lose someone. */}
          {signed ? null : (
            <>
<Text variant="micro" tone="dim" as="h2" id="the-commitment" className="eyebrow visually-hidden">
              What the signature commits
            </Text>
            {commitment}
            </>
          )}

          {signed ? (
            <Card>
              <CardHeader>
                <Stack
                  direction="row"
                  justify="between"
                  align="baseline"
                  gap="md"
                  wrap
                >
                  <Text
                    variant="micro"
                    tone="dim"
                    as="span"
                    className="eyebrow"
                  >
                    signed · hand this to the agent runtime
                  </Text>
                </Stack>
              </CardHeader>
              <CardBody>
                {/* Pasted, this has to either work or read as a blank. A
                    truncated sentence where the id goes is neither. */}
                <pre className="code mono">{`export CORDON_MANDATE=${
                  isAddress(MANDATE.id) ? `${MANDATE.id.slice(0, 14)}…` : "<the mandate you signed>"
                }
export CORDON_CHAIN=arc

npx -y @cordon/mcp                        # MCP
export HTTP_PROXY=http://localhost:8403   # anything else`}</pre>
                <Stack direction="row" gap="sm" align="center" wrap>
                  <Cta
                    magnetic
                    hint="the agent receives no key"
                    onClick={() => navigate("/console/tree")}
                  >
                    Go to the tree
                  </Cta>
                </Stack>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <Stack direction="column" gap="md">
                  <div>
                    <Text variant="micro" tone="dim" as="p" className="eyebrow">
                      the vault
                    </Text>
                    <Text variant="body" tone="copy" as="p">
                      The only funding source. Every agent key holds zero
                      balance and zero allowance beyond its current tranche.
                    </Text>
                    <span className="mono kv__break dim">{MANDATE.vault}</span>
                  </div>
                  <div>
                    <Text variant="micro" tone="dim" as="p" className="eyebrow">
                      no supervisor
                    </Text>
                    <Text variant="body" tone="copy" as="p">
                      No admin key, no proxy. A refusal must survive its
                      authors.
                    </Text>
                  </div>
                </Stack>
                <Enforced>the vault is the only funding source</Enforced>
              </CardBody>
            </Card>
          )}

          {signed ? (
            <>
<Text variant="micro" tone="dim" as="h2" id="the-commitment-signed" className="eyebrow visually-hidden">
              What was signed
            </Text>
            {commitment}
            </>
          ) : null}
        </Stack>
      </Grid>
    </>
  );
}
