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
import {
  ARC,
  ATTEST,
  DEPLOYMENT,
  ENFORCED_BY,
  GATEWAY,
  PENDING_ADDRESS,
  REGISTRY_BASELINE,
  SETTLEMENT,
  formatUsdc,
} from "@cordon/fixtures";
import { TREE, attestationOf, flatten, type Attestation } from "@cordon/fixtures/preview";
import { useLiveAgent, type LiveConduct } from "../parts/meter";
import { RecordShell } from "../parts/RecordShell";
import { useEntrance } from "../parts/motion";

/**
 * /attest/<id> — the x402 endpoint, as a page.
 *
 * A seller pays a cent to ask one question before serving: does this buyer
 * hold a live mandate, and what did the contract refuse it? The price is a
 * cent rather than a tenth of one because Circle's settlement fee is $0.0035
 * — see GATEWAY in fixtures — and a price under the fee cannot be settled.
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
/**
 * The live answer, in the shape the paid endpoint returns.
 *
 * The fields come from the meter, which is the same reduction of the same
 * events `packages/attest` sells — the seat is what a buyer pays for, not the
 * server. `verify` names the contracts so a reader can check any of it
 * without trusting either process.
 */
function liveAttestation(data: LiveConduct): Attestation {
  return {
    agentId: data.agentId ?? "",
    node: data.node,
    mandate: { ...data.mandate },
    conduct: {
      draws: data.draws,
      refusals: data.refusals,
      breaches: data.breaches,
      drawn6: data.drawn6,
      refused6: data.refused6,
      lifetimeSpent6: data.lifetime.spent6,
      lifetimeComplete: data.lifetime.complete,
      attested: data.attested,
      linkage: data.linkage,
    },
    refusals: data.rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      amount6: row.amount6,
      counterparty: row.counterparty,
      breachedAt: row.breachedAt,
      blockNumber: row.site.blockNumber,
      transactionHash: row.site.transactionHash,
      released: row.released === true,
      attested: row.attested === true,
    })),
    range: { chainId: data.chainId, fromBlock: data.fromBlock, toBlock: data.toBlock },
    /* Never a literal: the addresses come from the deployment file, and an
       undeployed tree reads `pending` rather than an address that opens in an
       explorer and shows somebody else's contract. */
    verify: {
      vault: DEPLOYMENT?.vault ?? PENDING_ADDRESS,
      registry: DEPLOYMENT?.registry ?? PENDING_ADDRESS,
      record: DEPLOYMENT?.record ?? PENDING_ADDRESS,
      explorer: ARC.explorer,
    },
  };
}

const plural = (count: number, noun: string): string =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

function NoSuchAgent({ id }: { id: string | undefined }) {
  usePageMeta({
    title: "No such agent · Cordon",
    description: "This identity is not in the range the meter has indexed.",
  });
  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            x402 · {formatUsdc(ATTEST.price6)} per call
          </Text>
          <Headline lines={["No agent", "with that identity."]} />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            The endpoint answers by ERC-8004 identity, and {id ?? "that id"} is
            not one the meter has seen in the range it has read. The endpoint
            itself answers the same way, and charges nothing for it: a payer
            must never be billed for an answer this range does not contain.
          </Text>
        </header>
      </Container>
    </RecordShell>
  );
}

export default function Attest() {
  const { id } = useParams();
  const nodes = flatten(TREE);
  const node =
    nodes.find((candidate) => String(candidate.agentId) === id) ?? nodes[0];
  /* An id the chain knows is answered from the chain. The preview tree is the
     illustration of last resort, and it says so when it is showing: this page
     used to draw fixtures for every id, so asking it about a real agent got a
     confident answer about an imaginary one. */
  const live = useLiveAgent(id);
  usePageMeta({
    title: `Attest ${live.state === "live" ? live.data.agentId : node.agentId} · Cordon`,
    description: `One x402 call: does this agent hold a live mandate, and what did the contract refuse it?`,
  });
  const animate = useEntrance();

  const body = live.state === "live" ? liveAttestation(live.data) : attestationOf(node);
  const linkagePct = Math.round(body.conduct.linkage * 100);

  /* An id the meter was asked about and did not have is not an invitation to
     show the demo tree. The preview ids are the preview's own; a number the
     chain does not carry gets the same answer the record pages give, which is
     nothing. */
  const previewId = nodes.some((candidate) => String(candidate.agentId) === id);
  if (live.state === "missing" && !previewId) return <NoSuchAgent id={id} />;

  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            x402 · {formatUsdc(ATTEST.price6)} per call
          </Text>
          <Headline
            animate={animate}
            lines={["One question,", "asked before serving."]}
          />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            Does this buyer hold a live mandate, and what did the contract
            refuse it? A seller pays {formatUsdc(ATTEST.price6)} rather than
            trusting a claim, and every line of the answer names the
            transaction it came from.
          </Text>
          {live.state === "live" ? (
            <Text variant="micro" tone="dim" as="p" className="public__stamp">
              Read from the chain · blocks {body.range.fromBlock}–
              {body.range.toBlock}
            </Text>
          ) : (
            <Preview note="the shape is the server's own; these figures are fixtures" />
          )}
        </header>

        <Grid columns={2} min={340} gap="lg" align="start">
          <Card>
            <CardHeader>
              <Text variant="micro" tone="dim" as="span" className="eyebrow">
                GET {ATTEST.resourcePath}/{body.agentId}
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
                    {/* A live record is often one of something, and "1 draws"
                        reads as a page that has never had a real number in
                        it. */}
                    {plural(body.conduct.refusals, "refusal")} in{" "}
                    {plural(body.conduct.draws, "draw")}, against a mandate of{" "}
                    {formatUsdc(BigInt(body.mandate.budget6))} per window at
                    depth {body.mandate.depth}.
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

            {/* The one purchase that has settled. Three transactions, each of
                which anyone can open, written into fixtures by a script that
                reads them back off the chain and refuses to record a purchase
                where the payer is not the node's operator or the payee is not
                the counterparty the contract was asked about. */}
            <Card>
              <CardBody>
                <Stack direction="column" gap="sm" align="start">
                  <Text variant="micro" tone="dim" as="p" className="eyebrow">
                    One of these has been paid for
                  </Text>
                  <Text variant="body" tone="copy" as="p">
                    On {SETTLEMENT.recordedAt.slice(0, 10)} an agent bought this
                    answer end to end: the contract released{" "}
                    {formatUsdc(SETTLEMENT.price6)} against every bound above
                    it, Circle's Gateway put that tranche into the operator's
                    own balance, and the seller collected the authorisation it
                    was handed. Three transactions, none of them ours to edit.
                  </Text>
                  <Stack direction="column" gap="xs" align="start">
                    {[
                      ["draw", SETTLEMENT.drawTx],
                      ["release", SETTLEMENT.mintTx],
                      ["collect", SETTLEMENT.collectTx],
                    ].map(([label, tx]) => (
                      <a
                        key={label}
                        className="mono"
                        href={`${ARC.explorer}/tx/${tx}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {label} {tx.slice(0, 10)}…{tx.slice(-6)}
                      </a>
                    ))}
                  </Stack>
                  <Text variant="micro" tone="dim" as="p">
                    Settling it cost {formatUsdc(GATEWAY.baseFee6)} in Circle's
                    fee and about {formatUsdc(GATEWAY.mintGas6)} in gas, both
                    from the operator's own float and neither inside the
                    mandate. That floor is why this call is priced at{" "}
                    {formatUsdc(ATTEST.price6)}: a tranche smaller than the fee
                    cannot pay for its own release.
                  </Text>
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
