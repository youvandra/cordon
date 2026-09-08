import { useParams } from "react-router-dom";
import {
  Card,
  CardBody,
  CardHeader,
  Container,
  Enforced,
  Grid,
  Headline,
  MetricCard,
  Preview,
  Stack,
  Tag,
  Text,
  usePageMeta,
} from "cordon-ui";
import { ATTEST, ENFORCED_BY, REGISTRY_BASELINE, formatUsdc } from "@cordon/fixtures";
import { TREE, attestationOf, flatten } from "@cordon/fixtures/preview";
import { RecordShell } from "../parts/RecordShell";
import { useEntrance } from "../parts/motion";

/**
 * /attest/<id> — the x402 endpoint, as a page.
 *
 * A seller pays a tenth of a cent to ask one question before serving: does
 * this buyer hold a live mandate, and what did the contract refuse it?
 *
 * The body below is built by `attestationOf` in fixtures, which is the same
 * type `packages/attest` returns from the chain. It used to be assembled here
 * by hand and carried three fields the endpoint has never returned — a page
 * drawing a response the server does not send is the same defect as a figure
 * the contract does not enforce.
 *
 * Headroom is one of the three that went. It is a window figure, read live
 * from the vault; the meter behind the endpoint indexes events and refuses to
 * recompute a bound from history, because an all-time total and a rolling
 * window look alike and only one of them refuses anything.
 */
export default function Attest() {
  const { id } = useParams();
  const nodes = flatten(TREE);
  const node =
    nodes.find((candidate) => String(candidate.agentId) === id) ?? nodes[0];
  usePageMeta({
    title: `Attest ${node.agentId} · Cordon`,
    description: `One x402 call: does ${node.label} hold a live mandate, and what did the contract refuse it?`,
  });
  const animate = useEntrance();

  const body = attestationOf(node);
  const price = Number(ATTEST.price6) / 1e6;
  const linkagePct = Math.round(body.conduct.linkage * 100);

  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            x402 · ${price.toFixed(3)} per call
          </Text>
          <Headline
            animate={animate}
            lines={["One question,", "asked before serving."]}
          />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            Does this buyer hold a live mandate, and what did the contract
            refuse it? A seller pays a tenth of a cent rather than trusting a
            claim, and every line of the answer names the transaction it came
            from.
          </Text>
          <Preview note="the shape is the server's own; these figures are fixtures" />
        </header>

        <Grid columns={2} min={340} gap="lg" align="start">
          <Card>
            <CardHeader>
              <Text variant="micro" tone="dim" as="span" className="eyebrow">
                GET {ATTEST.resourcePath}/{node.agentId}
              </Text>
            </CardHeader>
            <CardBody>
              <pre className="code code--body mono">{JSON.stringify(body, null, 2)}</pre>
              <Enforced>{ENFORCED_BY.refusal}</Enforced>
            </CardBody>
          </Card>

          <Stack direction="column" gap="lg">
            {/* This page's one hero figure: the property that makes the answer
                worth paying for, and the baseline it is measured against. */}
            <Text variant="micro" tone="dim" as="h2" id="the-answer" className="eyebrow visually-hidden">
              What the endpoint answers
            </Text>
            <MetricCard
              animate={animate}
              title={
                <>
                  Refusals naming their transaction
                  <br />
                  In this record, and in the registry
                </>
              }
              value={`${linkagePct}`}
              unit="%"
              progress={body.conduct.linkage}
              caption={
                <>
                  {REGISTRY_BASELINE.noLinkageLow}–{REGISTRY_BASELINE.noLinkageHigh}% of
                  <br />
                  existing feedback carries none
                </>
              }
              glaze="rose"
            />

            <Card>
              <CardBody>
                <Stack direction="column" gap="sm" align="start">
                  <Tag tone={body.mandate.live ? "positive" : "critical"} size="sm" dot>
                    {body.mandate.live ? "mandate live" : "mandate revoked"}
                  </Tag>
                  <Text variant="body" tone="copy" as="p">
                    {body.conduct.refusals} refusals in{" "}
                    {body.conduct.draws.toLocaleString()} draws, against a
                    mandate of {formatUsdc(BigInt(body.mandate.budget6))} per
                    window at depth {body.mandate.depth}.
                  </Text>
                  <Text variant="body" tone="copy" as="p">
                    {/* The window is a rate. A buyer pricing an agent off the
                        rate alone prices a mandate that renews itself. */}
                    {formatUsdc(BigInt(body.conduct.lifetimeSpent6))} of{" "}
                    {formatUsdc(BigInt(body.mandate.lifetimeCap6))} drawn in
                    total, across every window since the mandate was opened
                    {body.conduct.lifetimeComplete
                      ? "."
                      : " — and this answer's range starts after that, so the total is a floor, not the figure."}
                  </Text>
                  <Text variant="body" tone="copy" as="p">
                    {body.conduct.attested} of them are published in the
                    reputation registry. The rest were signed off by a named
                    human, and the answer says which.
                  </Text>
                  <Enforced>{ENFORCED_BY.record}</Enforced>
                </Stack>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stack direction="column" gap="sm" align="start">
                  <Text variant="micro" tone="dim" as="p" className="eyebrow">
                    Not in the answer
                  </Text>
                  <Text variant="body" tone="copy" as="p">
                    No score, and no headroom. A score is an opinion; headroom
                    is a live window the vault holds, and an indexer that
                    recomputed it from history would return a number that
                    refuses nothing.
                  </Text>
                </Stack>
              </CardBody>
            </Card>
          </Stack>
        </Grid>
      </Container>
    </RecordShell>
  );
}
