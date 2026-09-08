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
import { ARC, ENFORCED_BY, MANDATE } from "@cordon/fixtures";
import { TREE, flatten } from "@cordon/fixtures/preview";
import { RecordShell } from "../parts/RecordShell";
import { useEntrance } from "../parts/motion";

/**
 * /attest/<id> — the x402 endpoint, as a page.
 *
 * A seller pays a tenth of a cent to ask one question before serving: does this
 * buyer have a live mandate with headroom, and a clean record? The answer is
 * derived from the same contract reads the console renders, so there is no
 * second source of truth to drift.
 */
export default function Attest() {
  const { id } = useParams();
  const nodes = flatten(TREE);
  const node =
    nodes.find((candidate) => String(candidate.agentId) === id) ?? nodes[0];
  usePageMeta({
    title: `Attest ${node.agentId} — Cordon`,
    description: `One x402 call, a tenth of a cent: does ${node.label} have a live mandate with headroom and a record of staying inside it?`,
  });
  const animate = useEntrance();

  const body = {
    agentId: node.agentId,
    mandate: MANDATE.id,
    chain: ARC.chainId,
    live: true,
    headroom: "28.58",
    refusals: node.refused,
    draws: node.draws,
    depth: node.depth,
    concentrationPct: node.concentrationPct,
  };

  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            x402 · $0.001 per call
          </Text>
          <Headline
            animate={animate}
            lines={["One question,", "asked before serving."]}
          />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            Does this buyer have a live mandate with headroom, and a record of
            staying inside it? A seller pays a tenth of a cent rather than
            trusting a claim.
          </Text>
          <Preview note="endpoint shape is final; this response is a sample" />
        </header>

        <Grid columns={2} min={340} gap="lg" align="start">
          <Card>
            <CardHeader>
              <Text variant="micro" tone="dim" as="span" className="eyebrow">
                GET /attest/{node.agentId}
              </Text>
            </CardHeader>
            <CardBody>
              <pre className="code mono">{JSON.stringify(body, null, 2)}</pre>
              <Enforced>{ENFORCED_BY.budget}</Enforced>
            </CardBody>
          </Card>

          <Stack direction="column" gap="lg">
            {/* This page's one hero figure: what a seller actually asks for. */}
            <Text variant="micro" tone="dim" as="h2" id="the-answer" className="eyebrow visually-hidden">
              What the endpoint answers
            </Text>
            <MetricCard
              animate={animate}
              title={
                <>
                  Headroom, right now
                  <br />
                  What this buyer may still draw
                </>
              }
              value={body.headroom}
              unit="USDC"
              progress={0.29}
              caption={
                <>
                  Derived inside the contract,
                  <br />
                  never accepted as a parameter
                </>
              }
              glaze="rose"
            />

            <Card>
              <CardBody>
                <Stack direction="column" gap="sm" align="start">
                  <Tag tone="positive" size="sm" dot>
                    mandate live
                  </Tag>
                  <Text variant="body" tone="copy" as="p">
                    {node.refused} refusals in {node.draws.toLocaleString()}{" "}
                    draws, every one of them naming the transaction that
                    produced it.
                  </Text>
                  <Enforced>{ENFORCED_BY.record}</Enforced>
                </Stack>
              </CardBody>
            </Card>
          </Stack>
        </Grid>
      </Container>
    </RecordShell>
  );
}
