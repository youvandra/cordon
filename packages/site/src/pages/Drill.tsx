import { Link } from "react-router-dom";
import {
  Button,
  CardBody,
  Container,
  DataTable,
  Gauge,
  Headline,
  Section,
  Surface,
  Tag,
  Text,
  usePageMeta,
} from "cordon-ui";
import { DRILL, EVAL, GATES, MANDATE, SEARCH, formatUsdc } from "@cordon/fixtures";
import { RecordShell } from "../parts/RecordShell";
import { useEntrance } from "../parts/motion";

const TONE = {
  green: "positive",
  red: "critical",
  pending: "caution",
} as const;

/**
 * /drill — G3 and G4 in public.
 *
 * The needle stays unset. A gauge showing a plausible figure before the drill
 * has run is the single most tempting lie this project could tell, and the
 * whole argument for the number is that it is published whichever way it comes
 * out. The Gauge readout is this page's one LED face.
 */
export default function PublicDrill() {
  usePageMeta({
    title: "The hostile drill · Cordon",
    description:
      "An agent is given the daemon and told to spend as much as it can. Whatever it reaches is published, including the answer that disproves the product.",
  });
  const animate = useEntrance();
  const green = GATES.filter((gate) => gate.status === "green").length;

  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            g3 · the hostile drill
          </Text>
          {/* No dot-word here. The slot is a fixed 4.851em wide whatever is put
              in it, so a three-character word is drawn at twice the glyph
              width and runs into the line below. This page's LED face is the
              gauge's readout, which is the one number it exists to show. */}
          <Headline
            animate={animate}
            lines={[
              "Told to spend everything,",
              `it reached: ${formatUsdc(DRILL.reached6)}.`,
            ]}
          />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            An agent is given the daemon and a target, told to spend as much as
            it can, and neither restricted nor helped. Whatever it reaches is
            printed here, including the answer that disproves the product.
          </Text>
          <Text variant="micro" tone="dim" as="p" className="public__stamp">
            Run {DRILL.run.recordedAt.slice(0, 10)} against the live tree on Arc.
            Every figure below was read back from the chain afterwards.
          </Text>
        </header>

        <Surface
          glaze="ember"
          radius="6"
          elevation="tile"
          glow
          grain
          sheen
          className="drill"
        >
          {/* The needle is the measurement, not a decoration: the share of the
              ceiling the agent actually reached before a bound stopped it. */}
          <Gauge
            value={DRILL.reachedBps / 100}
            size={280}
            label={`Reached ${(DRILL.reachedBps / 100).toFixed(1)}% of the signed ceiling`}
            footnote={`${formatUsdc(DRILL.reached6)} of ${formatUsdc(DRILL.ceiling6)} signed ceiling`}
          >
            <span className="drill__unset mono">{DRILL.reachedBps / 100}%</span>
          </Gauge>
          <div>
            <Text variant="micro" tone="on-glaze" as="p" className="eyebrow">
              the two outcomes, written before the run
            </Text>
            <ul className="outcomes">
              <li>
                <b>Reached the bound.</b> The fence holds, and the number is the
                bound the owner signed.
              </li>
              <li>
                <b>Reached the treasury.</b> We have disproved our own product,
                and this page says so in the same type.
              </li>
            </ul>
            <p className="pane__foot">
              It reached the bound, and the bound was not the budget. The agent
              was refused by <b>{DRILL.stoppedBy.join(", ")}</b> — the same
              seller had taken{" "}
              {formatUsdc(DRILL.reached6)} of a ceiling that allowed{" "}
              {formatUsdc(DRILL.ceiling6)}, which is the share that mandate
              declared for any one counterparty. Its own window still had money
              in it. Each refusal below is a transaction, and each was published
              to the reputation registry.
            </p>
            <DataTable
              rows={DRILL.run.refusals}
              rowKey={(refusal) => refusal.id}
              columns={[
                {
                  id: "refusal",
                  header: "Refusal",
                  cell: (refusal) => (
                    <Link to={`/refusal/${refusal.id}`}>#{refusal.id}</Link>
                  ),
                },
                { id: "reason", header: "Refused by", cell: (refusal) => refusal.reason },
                {
                  id: "tx",
                  header: "Transaction",
                  cell: (refusal) => (
                    <span className="mono">{`${refusal.tx.slice(0, 10)}…${refusal.tx.slice(-6)}`}</span>
                  ),
                },
              ]}
            />
            <p className="pane__foot">
              G4 has run. {SEARCH.strategies.toLocaleString()} spend strategies,{" "}
              {SEARCH.draws.toLocaleString()} draws, {SEARCH.refused.toLocaleString()}{" "}
              refused, and {SEARCH.passedABound} past a bound. The closest any
              strategy got a root's window to was{" "}
              {formatUsdc(SEARCH.closestToBudget6)} of the{" "}
              {formatUsdc(SEARCH.budget6, 0)} root that run was scored against
              — the bound reached and not crossed. Scored by the contract and
              never by a model of it.
            </p>
          </div>
        </Surface>

        {/* G7 is the one gate that can come out against the product, so it is
            on the public page beside the drill rather than in the docs. Both
            scenarios are printed whichever way they went; the verdict is
            computed from the criteria, not written by anyone. */}
        <Section
          title="g7 · the work still gets done"
          aside={
            <Text variant="micro" tone="dim" as="span">
              {EVAL.runs} runs each · {EVAL.recordedAt}
            </Text>
          }
        >
          {/* Fixed widths, because two tables that size their own columns put
              the same figure in two places and the eye reads them as different
              measurements. */}
          {EVAL.scenarios.map((scenario) => (
            <div key={scenario.id} className="evalscenario">
              <Text variant="micro" tone="dim" as="p" className="eyebrow">
                {scenario.id.replace(/-/g, " ")} · {scenario.agent} ·{" "}
                {scenario.workerShareBps / 100}% of the window each
              </Text>
              <DataTable
                rows={scenario.conditions}
                rowKey={(condition) => condition.id}
                columns={[
                  {
                    id: "id",
                    header: "Condition",
                    cell: (condition) => (
                      <b>{condition.id === "cordon" ? "Cordon" : "A plain shared cap"}</b>
                    ),
                  },
                  {
                    id: "completed",
                    header: "Briefs completed",
                    width: 130,
                    cell: (condition) => `${condition.completed} of ${condition.runs}`,
                  },
                  {
                    id: "spent",
                    header: "Spent",
                    numeric: true,
                    width: 100,
                    cell: (condition) => formatUsdc(condition.spent6),
                  },
                  {
                    /* Only meaningful in the second scenario, and printed in
                       both so the columns do not move between them. */
                    id: "runaway",
                    header: "Taken by the loop",
                    numeric: true,
                    width: 140,
                    cell: (condition) => formatUsdc(condition.runaway6),
                  },
                  {
                    id: "refused",
                    header: "Refused by",
                    width: 170,
                    cell: (condition) =>
                      condition.refusals === 0
                        ? "nothing"
                        : `${condition.refusals} · ${condition.reasons.join(", ")}`,
                  },
                  {
                    /* The column the first scenario turns on. Both conditions
                       bought the same sources; only one had the owner's money
                       somewhere else before the work started. */
                    id: "exposure",
                    header: "At risk before any work",
                    numeric: true,
                    width: 190,
                    cell: (condition) => formatUsdc(condition.exposureAtStart6),
                  },
                  {
                    id: "writes",
                    header: "Transactions per purchase",
                    numeric: true,
                    width: 190,
                    cell: (condition) => condition.writesPerPurchase,
                  },
                ]}
              />
            </div>
          ))}
          <p className="pane__foot">
            One task — a brief citing {EVAL.sources} paid sources, split across a
            root and its two workers — run {EVAL.runs} times under each
            condition, against criteria fixed before the first run: a brief
            counts as done only when every source is cited with the body that
            seller actually served. Both conditions are given the same
            authority, the {formatUsdc(EVAL.window6, 0)} window the owner
            signed. Verdict:{" "}
            <b>
              {EVAL.verdict === "work-gets-through"
                ? "the work gets through"
                : "the fence blocks the work"}
            </b>
            . The agents are scripted and deterministic, which is why they are
            named here rather than implied; latency is not measured, because a
            local chain&rsquo;s confirmation time is not Arc&rsquo;s.
          </p>
        </Section>

        <Section
          title="gates"
          aside={
            <Text variant="micro" tone="dim" as="span">
              {green} of {GATES.length} green · max depth {MANDATE.maxDepth}
            </Text>
          }
        >
          <DataTable
            rows={GATES}
            rowKey={(gate) => gate.id}
            columns={[
              {
                id: "id",
                header: "",
                width: 52,
                cell: (gate) => (
                  <span className="mono gate__id">{gate.id}</span>
                ),
              },
              {
                id: "name",
                header: "Gate",
                cell: (gate) => <b>{gate.name}</b>,
              },
              { id: "ends", header: "Ends when", cell: (gate) => gate.ends },
              {
                id: "status",
                header: "",
                align: "end",
                width: 152,
                cell: (gate) => (
                  <span className="gate__status">
                    <Tag tone={TONE[gate.status]} size="sm">
                      {gate.status}
                    </Tag>
                    {gate.tests === null ? null : (
                      <Text variant="micro" tone="dim" as="span">
                        {gate.tests} tests
                      </Text>
                    )}
                  </span>
                ),
              },
            ]}
          />
          <CardBody>
            <Link to="/agent/41827">
              <Button variant="secondary" size="sm" iconEnd="arrow-right">
                A public conduct record
              </Button>
            </Link>
          </CardBody>
        </Section>
      </Container>
    </RecordShell>
  );
}
