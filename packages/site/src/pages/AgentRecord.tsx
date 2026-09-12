import { Link, useParams } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  Container,
  DataTable,
  Enforced,
  Grid,
  Headline,
  MetricCard,
  Preview,
  Section,
  Stack,
  Surface,
  Tag,
  Text,
  usePageMeta,
} from "cordon-ui";
import type { Strength } from "cordon-ui";
import {
  ARC,
  ATTEST,
  ENFORCED_BY,
  ERC8004,
  MANDATE,
  REGISTRY_BASELINE,
  STRENGTH,
  formatUsdc,
} from "@cordon/fixtures";
import {
  AGENT_PROFILE,
  RECORD,
  TREE,
  flatten,
  lifetime,
  refusalForRecord,
  refusalOrdinal,
  shortTx,
  txUrl,
  type RecordEntry,
} from "@cordon/fixtures/preview";
import { RecordShell } from "../parts/RecordShell";
import { RecordSkeleton } from "../parts/RecordSkeleton";
import { useEntrance } from "../parts/motion";
import { useLiveAgent, type LiveConduct } from "../parts/meter";
import { shortId, isAddress } from "@cordon/fixtures";

const KIND: Record<
  RecordEntry["kind"],
  { label: string; tone: "neutral" | "positive" | "critical" }
> = {
  feedback: { label: "feedback", tone: "neutral" },
  refusal: { label: "refused", tone: "critical" },
  draw: { label: "draw", tone: "positive" },
  revocation: { label: "revoked", tone: "neutral" },
};

/**
 * /agent/<8004-id> — the public record.
 *
 * One LED figure, not five. The rationing rule is that the dot face belongs to
 * the one number a view exists to show; this page exists to show that the
 * contract refused, so the refusal count wears it and the supporting figures
 * are ordinary tabular ones in Bento cells.
 */
export default function AgentRecord() {
  const { id } = useParams();
  /* The meter first: the ids in the registry are the chain's, and the demo
     tree's are an illustration that still resolves beside them. */
  const live = useLiveAgent(id);
  const nodes = flatten(TREE);
  const node = nodes.find((candidate) => String(candidate.agentId) === id);

  if (live.state === "live") return <LiveAgentRecord data={live.data} />;
  if (live.state === "loading" && !node) return <ReadingRecord id={id} />;
  /* Not `?? nodes[0]`. An unknown id used to render the first agent in the
     tree as though it were the one asked for, which is the same defect the
     refusal page names: a record URI that quietly shows a different subject is
     worse than one that shows nothing. */
  if (!node) return <NoSuchAgent id={id} />;
  return <PreviewAgentRecord node={node} />;
}

function ReadingRecord({ id }: { id: string | undefined }) {
  return (
    <RecordSkeleton
      eyebrow={`erc-8004 identity · token ${id ?? "—"} · arc ${ARC.chainId}`}
    />
  );
}


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
            erc-8004 identity · token {id ?? "—"} · arc {ARC.chainId}
          </Text>
          <Headline lines={["No agent", "with that identity."]} />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            Records resolve here by the identity their operator bound. This one
            is not in the range the meter has indexed, so the honest answer is
            nothing rather than the nearest agent — a record that shows a
            different subject is worse than one that shows none.
          </Text>
          <Stack direction="row" gap="md" wrap>
            <Link to="/agent/41827">A conduct record</Link>
            <Link to="/">The argument</Link>
          </Stack>
        </header>
      </Container>
    </RecordShell>
  );
}

/**
 * The same page for an agent the meter has, printing what the chain carries.
 *
 * Fewer figures than the preview, and deliberately: concentration and depth are
 * shaped by the demo tree, and the meter reduces events rather than modelling
 * the contract's window arithmetic. What is here is counted from logs.
 */
/**
 * The share of what this node asked for that the contract refused.
 *
 * The denominator is every attempt, not the draws: a refused attempt never
 * became a draw, so dividing by draws alone gives a rate that can exceed 100%
 * and did — a node with three refusals and no draws read `300.000%`, because
 * the zero was clamped to one rather than recognised as an empty denominator.
 *
 * `null` when nothing has been asked for at all, which is a different sentence
 * from a rate of zero.
 */
function breachRateOf(refusals: number, draws: number): string | null {
  const attempts = refusals + draws;
  if (attempts === 0) return null;
  return ((refusals / attempts) * 100).toFixed(3);
}

function LiveAgentRecord({ data }: { data: LiveConduct }) {
  const animate = useEntrance();
  const rate = breachRateOf(data.refusals, data.draws);

  usePageMeta({
    title: `Agent ${data.agentId} · conduct record · Cordon`,
    description: `What agent ${data.agentId} drew, what the contract refused, and the transaction behind every entry.`,
  });

  const figures = [
    { value: String(data.refusals), label: "refused by the contract" },
    { value: data.draws.toLocaleString(), label: "draws authorised" },
    { value: String(data.breaches), label: "refusals this node's own bound caused" },
    { value: formatUsdc(BigInt(data.drawn6)), label: "drawn" },
    { value: formatUsdc(BigInt(data.refused6)), label: "asked for and refused" },
    /* A share of refusals, and there is no share of nothing: this printed
       100% for a node that has never been refused anything, which is true of
       the arithmetic and says nothing about the agent. */
    ...(data.refusals > 0
      ? [
          {
            value: `${Math.round(data.linkage * 100)}%`,
            label: "refusals naming their transaction",
          },
        ]
      : []),
  ];

  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            erc-8004 identity · token {data.agentId} · arc {data.chainId}
          </Text>
          <Headline animate={animate} lines={["The RECORD", "read from chain"]} dotWord="RECORD" />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            Not a review. Nobody typed it. Every figure below was counted from
            events the contract emitted, and every refusal names the
            transaction it happened in.
          </Text>
          <Stack direction="row" gap="md" wrap>
            <Tag tone="positive" size="sm" dot>
              read from the chain
            </Tag>
            <Text variant="micro" tone="dim" as="span">
              node <span className="mono">{shortId(data.node)}</span> · blocks{" "}
              {data.fromBlock}–{data.toBlock}
            </Text>
          </Stack>
        </header>

        <Section title={rate === null ? "nothing asked for yet" : `breach rate ${rate}%`}>
          <Grid columns={3} min={220} gap="md">
            {figures.map((row) => (
              <Card key={row.label}>
                <CardBody>
                  <div className="figure">
                    <span className="figure__value num">{row.value}</span>
                    <span className="figure__label">{row.label}</span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </Grid>
        </Section>

        <Section
          title="the ledger"
          aside={
            <Text variant="micro" tone="dim" as="span">
              {data.lifetime.complete ? "" : "partial range · "}
              {formatUsdc(BigInt(data.lifetime.spent6))} drawn for the life of this mandate
            </Text>
          }
        >
          {data.rows.length === 0 ? (
            <Text variant="body" tone="copy" as="p">
              Nothing has been refused at this node in the range the meter has
              read. That is a fact about the range as much as about the agent.
            </Text>
          ) : (
            <DataTable
              rows={data.rows}
              rowKey={(row) => row.id}
              columns={[
                {
                  id: "id",
                  header: "Refusal",
                  cell: (row) => (
                    <Link to={`/refusal/${row.id}`} className="mono">
                      {row.id}
                    </Link>
                  ),
                },
                { id: "reason", header: "Bound", cell: (row) => row.reason },
                {
                  id: "amount",
                  header: "Asked for",
                  numeric: true,
                  cell: (row) => formatUsdc(BigInt(row.amount6)),
                },
                {
                  id: "payee",
                  header: "Recipient",
                  cell: (row) => (
                    <span className="mono">
                      {isAddress(row.counterparty)
                        ? `${row.counterparty.slice(0, 10)}…${row.counterparty.slice(-4)}`
                        : row.counterparty}
                    </span>
                  ),
                },
                {
                  id: "tx",
                  header: "Transaction",
                  cell: (row) => (
                    <a href={txUrl(row.site.transactionHash)} target="_blank" rel="noreferrer" className="mono">
                      {shortTx(row.site.transactionHash)}
                    </a>
                  ),
                },
              ]}
            />
          )}
        </Section>
      </Container>
    </RecordShell>
  );
}

function PreviewAgentRecord({ node }: { node: ReturnType<typeof flatten>[number] }) {
  usePageMeta({
    title: `Agent ${node.agentId} · conduct record · Cordon`,
    description: `What ${node.label} asked for, what its mandate allowed, and which draws the contract refused. Every entry names the transaction that produced it.`,
  });
  const animate = useEntrance();

  const breachRate = breachRateOf(node.refused, node.draws) ?? "0.000";

  const supporting: {
    value: string;
    label: string;
    fn: string;
    /** Absent means enforced, which is the ordinary case. */
    strength?: Strength;
  }[] = [
    {
      value: String(node.refused),
      label: "refused by the contract",
      fn: ENFORCED_BY.refusal,
    },
    {
      value: node.draws.toLocaleString(),
      label: "draws authorised",
      fn: ENFORCED_BY.budget,
    },
    {
      value: `${node.concentrationPct}%`,
      label: "highest declared concentration",
      fn: ENFORCED_BY.concentration,
      strength: STRENGTH.concentration,
    },
    {
      value: `${node.depth}/${MANDATE.maxDepth}`,
      label: "depth reached",
      fn: ENFORCED_BY.depth,
    },
  ];

  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            erc-8004 identity · token {node.agentId} · arc {ARC.chainId}
          </Text>
          <Headline
            animate={animate}
            lines={["The RECORD", `of ${node.label}`]}
            dotWord="RECORD"
          />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            Not a review. Nobody typed it. It is a measurement a contract made:
            what this agent asked for, what its owner&rsquo;s mandate allowed,
            and which draws were refused. The agent belongs to that owner —
            this is a record of somebody&rsquo;s own fleet, published so that
            the people it buys from can read it.
          </Text>
          <Preview note="record shape is final; entries are samples" />
        </header>

        {/* The page's argument, before the page's evidence. It used to sit
            third, after the hero figure and the four supporting ones, which
            asked the reader to hold four numbers in mind before being told
            what they were for. */}
        <Surface
          as="section"
          aria-labelledby="the-comparison"
          glaze="violet"
          radius="6"
          elevation="tile"
          glow
          grain
          sheen
          className="compare__panel"
        >
          <Text
            variant="micro"
            tone="on-glaze"
            as="h2"
            id="the-comparison"
            className="eyebrow"
          >
            the one comparison this page prints
          </Text>
          <p className="compare">
            This registry: {REGISTRY_BASELINE.noLinkageLow}–
            {REGISTRY_BASELINE.noLinkageHigh}% of records carry no payment
            linkage. <em>This page: 100% do.</em>
          </p>
          <p className="pane__foot mono">{REGISTRY_BASELINE.source}</p>
        </Surface>

        {/* The metric tile scales as a rigid unit — it places its children at
            percentages of its own width, so stretching it to fill a two-row
            Bento cell drives the caption straight through the numeral. It gets
            a column of its own and keeps its natural size; the supporting
            figures, which are ordinary type, fill the Bento beside it. */}
        <section aria-labelledby="the-figures">
          <Text
            variant="micro"
            tone="dim"
            as="h2"
            id="the-figures"
            className="eyebrow"
          >
            what the contract measured
          </Text>
          <Grid columns={2} min={320} gap="lg" align="start">
            <Stack direction="column" gap="sm" align="start">
              {/* The tile fixes the numeral's width at 28% of its own and the
                SVG keeps its aspect, so a value's HEIGHT falls out of its
                character count: "2" is drawn 1.4x taller than the slot between
                the metric and the caption, and lands on top of it. The hero
                figure is therefore the rate, which is the refusal expressed at
                a length the tile was drawn for — and it is the figure an
                underwriter reads anyway. The count itself leads the Bento. */}
              <MetricCard
                animate={animate}
                title={
                  <>
                    Breach rate
                    <br />
                    Refusals over everything asked for
                  </>
                }
                value={breachRate}
                unit="%"
                progress={Math.min(1, Number(breachRate) / 1)}
                caption={
                  <>
                    {node.refused} refused of{" "}
                    {(node.refused + node.draws).toLocaleString()} asked for,
                    <br />
                    each naming its transaction
                  </>
                }
                glaze="rose"
              />
              <Enforced>refusals ÷ draws · {ENFORCED_BY.refusal}</Enforced>
            </Stack>

            {/* Not a Bento. That device is for a grid of destinations you want
              seen at once; these are four supporting figures read as a set,
              and a grid of cards does it without the pretence. */}
            <Grid columns={2} min={200} gap="md">
              {supporting.map((figure) => (
                <Card key={figure.label}>
                  <CardBody>
                    <div className="figure">
                      <span className="figure__value num">{figure.value}</span>
                      <span className="figure__label">{figure.label}</span>
                      <Enforced strength={figure.strength}>{figure.fn}</Enforced>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </Grid>
          </Grid>
        </section>

        <Section
          title="the ledger"
          aside={
            <Enforced>
              {RECORD.length} of {RECORD.length} entries name a transaction
            </Enforced>
          }
        >
          <DataTable
            rows={RECORD}
            rowKey={(entry) => entry.tx + entry.at}
            columns={[
              {
                id: "kind",
                header: "Kind",
                width: 116,
                cell: (entry) => (
                  <Tag tone={KIND[entry.kind].tone} size="sm" dot>
                    {KIND[entry.kind].label}
                  </Tag>
                ),
              },
              {
                id: "at",
                header: "Time",
                width: 88,
                cell: (entry) => (
                  <span className="mono cell__id">
                    {entry.at.slice(11, 19)}
                  </span>
                ),
              },
              {
                id: "detail",
                header: "What the contract did",
                /* A refusal row and the page the chain points at are the same
                   event twice, and until this the reader had to notice that
                   the transaction hash in the last column matched a URL they
                   had never been shown. The rows that are about a refusal
                   carry it; a draw and a revocation are not, and are left as
                   plain text rather than given a link that guesses. */
                cell: (entry) => {
                  const refusal = refusalForRecord(entry);
                  if (!refusal) return entry.detail;
                  return (
                    <Link to={`/refusal/${refusalOrdinal(refusal)}`}>
                      {entry.detail}
                    </Link>
                  );
                },
              },
              {
                id: "amount",
                header: "Amount",
                numeric: true,
                width: 96,
                cell: (entry) =>
                  entry.amount6 === undefined ? "·" : formatUsdc(entry.amount6),
              },
              {
                id: "tx",
                header: "Transaction",
                width: 148,
                cell: (entry) => (
                  <a
                    className="mono"
                    href={txUrl(entry.tx)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortTx(entry.tx)}
                  </a>
                ),
              },
            ]}
          />
        </Section>

        <Section
          title="the mandate this agent runs under"
          aside={<Enforced>windowSeconds is equal at every depth</Enforced>}
        >
          <CardBody>
            <dl className="kv kv--rows">
              {[
                ["owner", AGENT_PROFILE.owner],
                ["mandate", MANDATE.id],
                ["parent", AGENT_PROFILE.parent],
                ["window", `${MANDATE.windowSeconds.toLocaleString()}s`],
                ["window budget", formatUsdc(node.budget6)],
                /* A window budget on its own is a rate, and a reader takes a
                   rate for a total. The total is the figure the owner signed,
                   and it is the one that does not come back tomorrow. */
                [
                  "signed in total",
                  `${formatUsdc(lifetime(node).spent6)} of ${formatUsdc(
                    lifetime(node).cap6,
                  )} drawn`,
                ],
                ["identity registry", ERC8004.identity],
                ["reputation registry", ERC8004.reputation],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd className="mono kv__break">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Section>

        <Card>
          <CardBody>
            <Stack
              direction="row"
              justify="between"
              align="center"
              gap="md"
              wrap
            >
              <div>
                <Text variant="micro" tone="dim" as="p" className="eyebrow">
                  machine-readable
                </Text>
                <Text variant="body" tone="copy" as="p">
                  Sellers gate on it before serving. Underwriters price on it.
                </Text>
              </div>
              <Link to={`/attest/${node.agentId}`}>
                <Button
                  variant="primary"
                  size="md"
                  magnetic
                  iconEnd="arrow-right"
                >
                  /attest/{node.agentId} · ${Number(ATTEST.price6) / 1e6}
                </Button>
              </Link>
            </Stack>
          </CardBody>
        </Card>
      </Container>
    </RecordShell>
  );
}
