import { Link, useParams } from "react-router-dom";
import {
  Card,
  CardBody,
  Container,
  Enforced,
  Grid,
  Headline,
  MetricCard,
  Preview,
  Section,
  Stack,
  Tag,
  Text,
  usePageMeta,
} from "cordon-ui";
import { ARC, ENFORCED_BY, STRENGTH, formatUsdc, isAddress, shortAddress, strengthOf } from "@cordon/fixtures";
import {
  addrUrl,
  refusalByPath,
  refusalOrdinal,
  shortTx,
  txUrl,
  type Refusal as RefusalRow,
} from "@cordon/fixtures/preview";
import { RecordShell } from "../parts/RecordShell";
import { useEntrance } from "../parts/motion";

/**
 * /refusal/<id> — the page the chain points at.
 *
 * This is not a page anybody navigates to. `ConductRecord.RECORD_BASE` is a
 * Solidity `constant`, so every record Cordon writes into the ERC-8004
 * Reputation Registry carries `https://getcordon.xyz/refusal/<id>` as its
 * feedback URI, forever, with no setter to change it. Someone arrives here
 * from a registry entry, cold, wanting to know what the tag means. Until this
 * page existed they got the site's not-found — a record whose linkage
 * resolves to nothing, which is the exact property this project claims 98.7%
 * of that registry's existing feedback lacks.
 *
 * So the page answers the question a registry reader has, in the order they
 * have it: what was asked, what stopped it, on whose limit, and did anybody
 * later sign it out. Nothing here is a score. Every line is a thing the
 * contract did, and names the transaction it did it in.
 *
 * One dot-face figure, per the rationing rule. This page exists to show that
 * a bound held, so the money that did not move wears it.
 */

/** What a reader needs before they trust anything else on the page. */
function Provenance({ refusal }: { refusal: RefusalRow }) {
  return (
    <Card>
      <CardBody>
        <Stack direction="column" gap="sm" align="start">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            where this came from
          </Text>
          <Text variant="body" tone="copy" as="p">
            The refusal is in transaction{" "}
            <a href={txUrl(refusal.tx)} target="_blank" rel="noreferrer" className="mono">
              {shortTx(refusal.tx)}
            </a>{" "}
            on {ARC.name}. The contract returned rather than reverting, which
            is why there is an event to read at all: a refusal that reverts
            rolls back its own record.
          </Text>
          <Enforced>{ENFORCED_BY.refusal}</Enforced>
        </Stack>
      </CardBody>
    </Card>
  );
}

/** The override, when there is one. Its absence is also an answer. */
function Release({ refusal }: { refusal: RefusalRow }) {
  return (
    <Card>
      <CardBody>
        <Stack direction="column" gap="sm" align="start">
          <Tag tone={refusal.released ? "neutral" : "positive"} size="sm" dot>
            {refusal.released ? "signed out later" : "still standing"}
          </Tag>
          {refusal.release ? (
            <>
              <Text variant="body" tone="copy" as="p">
                A named human paid this counterparty anyway, from their own
                key, at {refusal.release.at}. The bound did not move: the
                release pays the party that was refused and touches no window,
                because that money was never inside the window's authority.
              </Text>
              <Text variant="body" tone="copy" as="p">
                Signed by{" "}
                {/* An explorer link to a sentence resolves to nothing, so an
                    owner nobody has signed as is named, not linked. */}
                {isAddress(refusal.release.by) ? (
                  <a
                    href={addrUrl(refusal.release.by)}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                  >
                    {shortAddress(refusal.release.by, 10, 6)}
                  </a>
                ) : (
                  <span className="mono">the owner’s own key</span>
                )}{" "}
                in{" "}
                <a
                  href={txUrl(refusal.release.tx)}
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                >
                  {shortTx(refusal.release.tx)}
                </a>
                . The refusal above stays where it is.
              </Text>
              <Enforced>{ENFORCED_BY.release}</Enforced>
            </>
          ) : (
            <>
              <Text variant="body" tone="copy" as="p">
                Nobody has signed an exception. There is no supervisor role and
                no admin key on either contract, so the only way past this is
                the owner's own signature on a release, and it would appear
                here as its own transaction.
              </Text>
              <Enforced>{ENFORCED_BY.release}</Enforced>
            </>
          )}
        </Stack>
      </CardBody>
    </Card>
  );
}

/** Whether this refusal is in the registry, and what that is worth. */
function Published({ refusal }: { refusal: RefusalRow }) {
  return (
    <Card>
      <CardBody>
        <Stack direction="column" gap="sm" align="start">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            in the reputation registry
          </Text>
          {refusal.attested ? (
            <>
              <Text variant="body" tone="copy" as="p">
                Published against identity{" "}
                <Link to={`/agent/${refusal.attested.agentId}`} className="mono">
                  {refusal.attested.agentId}
                </Link>{" "}
                at {refusal.attested.at}, tagged <span className="mono">cordon.refused</span>.
                The daemon publishes every refusal with no filter and after the
                fact, so a release cannot retract one and a broken recorder
                costs the record its completeness and costs enforcement
                nothing.
              </Text>
              <Enforced>{ENFORCED_BY.record}</Enforced>
            </>
          ) : (
            <Text variant="body" tone="copy" as="p">
              Not published. That means the recorder had no seat or has not
              caught up — it does not mean the refusal did not happen. The
              transaction above is the authority either way.
            </Text>
          )}
        </Stack>
      </CardBody>
    </Card>
  );
}

function NotFound({ id }: { id: string | undefined }) {
  usePageMeta({
    title: "No such refusal · Cordon",
    description: "This record id is not in the range the meter has indexed.",
  });
  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            refusal {id ?? "—"} · {ARC.name}
          </Text>
          <Headline lines={["No refusal", "with that id."]} />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            Records resolve here by the id the contract wrote into them. This
            one is not in the range the meter has indexed, so the honest answer
            is nothing rather than the nearest refusal — a record URI that
            shows a different refusal is worse than one that shows none.
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

export default function Refusal() {
  const { id } = useParams();
  const refusal = refusalByPath(id);
  const animate = useEntrance();

  if (!refusal) return <NotFound id={id} />;

  const ordinal = refusalOrdinal(refusal);
  const held6 = refusal.requested6 - refusal.headroom6;

  usePageMeta({
    title: `Refusal ${ordinal} · Cordon`,
    description:
      `${formatUsdc(refusal.requested6)} was asked for and the contract refused it: ` +
      `${refusal.boundLabel}. The transaction is on ${ARC.name}.`,
  });

  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            refusal {ordinal} · {refusal.at} · {ARC.name}
          </Text>
          <Headline animate={animate} lines={["A bound held,", "and left a record."]} />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            The node <span className="mono">{refusal.nodeLabel}</span> asked for{" "}
            {formatUsdc(refusal.requested6)} and the contract refused it. This
            page is where that refusal resolves, because the id in the record
            is this one, and it is the whole of what the record means.
          </Text>
          <Preview note="the shape is the meter's own; these figures are fixtures until the deploy" />
        </header>

        <Grid columns={2} min={340} gap="lg" align="start">
          <Stack direction="column" gap="sm" align="start">
            {/* The one figure this page exists for: money that did not move,
                because a limit somebody had already signed said it could
                not. The progress ring is what was left against what was
                asked, so a bar close to empty is the refusal itself. */}
            <MetricCard
              animate={animate}
              title={
                <>
                  Refused
                  <br />
                  Asked for, and not paid
                </>
              }
              value={formatUsdc(held6, 0).replace("$", "")}
              unit="USDC"
              progress={
                refusal.requested6 === 0n
                  ? 0
                  : Number(refusal.headroom6) / Number(refusal.requested6)
              }
              caption={
                <>
                  {formatUsdc(refusal.headroom6)} of
                  <br />
                  {formatUsdc(refusal.requested6)} was available
                </>
              }
              glaze="rose"
            />
            <Enforced>{ENFORCED_BY.refusal}</Enforced>
          </Stack>

          <Stack direction="column" gap="lg">
            <Card>
              <CardBody>
                <Stack direction="column" gap="sm" align="start">
                  <Text variant="micro" tone="dim" as="p" className="eyebrow">
                    what stopped it
                  </Text>
                  <Text variant="body" tone="copy" as="p">
                    {refusal.boundLabel}. The contract evaluated the limit
                    itself; nothing in the path scored the request, and no
                    model was asked.
                  </Text>
                  {/* The strength comes from the bound, not from the
                      default. `<Enforced>` assumes enforced when given no
                      strength, and concentration is not: a refusal on that
                      bound is real, but which counterparty it was measured
                      against is the daemon's declaration. */}
                  <Enforced strength={strengthOf(refusal.bound)}>
                    {refusal.bound}
                  </Enforced>
                </Stack>
              </CardBody>
            </Card>

            <Provenance refusal={refusal} />
          </Stack>
        </Grid>

        <Section title="the draw the contract refused">
          <Stack direction="column" gap="md">
            <Grid columns={3} min={220} gap="md">
              {[
                {
                  label: "the node that asked",
                  value: refusal.nodeLabel,
                  fn: ENFORCED_BY.budget,
                },
                {
                  label: "asked for",
                  value: formatUsdc(refusal.requested6),
                  fn: ENFORCED_BY.refusal,
                },
                {
                  label: "room left at the bound",
                  value: formatUsdc(refusal.headroom6),
                  fn: ENFORCED_BY.headroom,
                },
              ].map((row) => (
                <Card key={row.label}>
                  <CardBody>
                    <div className="figure">
                      <span className="figure__value num">{row.value}</span>
                      <span className="figure__label">{row.label}</span>
                      <Enforced>{row.fn}</Enforced>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </Grid>

            {/* The counterparty is a URL, and it was in a figure slot beside
                the three amounts until it was measured: 374px of path in a
                280px box, clipped with no scrollbar, so the end of the
                endpoint simply was not on the page. A figure slot sets type
                for a short number. This one gets a row it can wrap in. */}
            <Card>
              <CardBody>
                <div className="figure">
                  <span className="figure__value figure__value--path mono">
                    {refusal.counterparty}
                  </span>
                  <span className="figure__label">
                    the counterparty the daemon declared
                  </span>
                  <Enforced strength={STRENGTH.concentration}>
                    {ENFORCED_BY.concentration}
                  </Enforced>
                </div>
              </CardBody>
            </Card>
          </Stack>
        </Section>

        <Section title="what happened after">
          <Grid columns={2} min={340} gap="lg" align="start">
            <Release refusal={refusal} />
            <Published refusal={refusal} />
          </Grid>
        </Section>
      </Container>
    </RecordShell>
  );
}
