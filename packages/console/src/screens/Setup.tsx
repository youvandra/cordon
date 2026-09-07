import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardBody,
  CardHeader,
  Cta,
  Field,
  Grid,
  MetricCard,
  Select,
  Stack,
  Text,
  TextField,
} from "cordon-ui";
import { ENFORCED_BY, MANDATE } from "@cordon/fixtures";
import { Enforced, ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";
import { useEntrance } from "../lib/entrance";

const WINDOWS = [
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
];

export default function Setup() {
  useTitle("Setup — Cordon console");
  const animate = useEntrance();
  const navigate = useNavigate();

  const [budget, setBudget] = useState(String(MANDATE.budget6 / 1_000_000n));
  const [windowS, setWindowS] = useState(String(MANDATE.windowSeconds));
  const [depth, setDepth] = useState(String(MANDATE.maxDepth));
  const [tranche, setTranche] = useState(String(MANDATE.tranche6 / 1_000_000n));
  const [concentration, setConcentration] = useState(
    String(MANDATE.concentrationBoundPct),
  );
  const [signed, setSigned] = useState(false);

  return (
    <>
      <ScreenHead
        title="Sign one mandate. Fund the vault once."
        lede="Children are created by their parent, in seconds, while you sleep. The contract refuses a child wider than its parent, so no per-spawn approval is required — and none would be safe to require."
        note="nothing is signed or sent"
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
                label="Window"
                hint="equal at every depth — a shorter child window resets faster than the parent it debits"
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

              <Field
                label="Counterparty concentration bound"
                hint={`${ENFORCED_BY.concentration} · percent of one window to a single payTo`}
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
                hint="EIP-712, from the owner's own key"
                onClick={() => setSigned(true)}
              >
                Sign mandate
              </Cta>
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
              progress={Math.min(
                1,
                Number(tranche) / Math.max(1, Number(budget)),
              )}
              caption={
                <>
                  per {Number(windowS).toLocaleString()}s
                  <br />
                  across the whole tree
                </>
              }
              glaze="violet"
            />
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
                <pre className="code mono">{`export CORDON_MANDATE=${MANDATE.id.slice(0, 14)}…
export CORDON_CHAIN=arc

npx -y @cordon/mcp                        # MCP
export HTTP_PROXY=http://localhost:8402   # anything else`}</pre>
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
              progress={Math.min(
                1,
                Number(tranche) / Math.max(1, Number(budget)),
              )}
              caption={
                <>
                  per {Number(windowS).toLocaleString()}s
                  <br />
                  across the whole tree
                </>
              }
              glaze="violet"
            />
            </>
          ) : null}
        </Stack>
      </Grid>
    </>
  );
}
