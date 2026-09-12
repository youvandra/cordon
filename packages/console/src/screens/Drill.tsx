import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Gauge,
  Surface,
  Tag,
  Text,
} from "cordon-ui";
import { DRILL, EVAL, GATES, SEARCH, formatUsdc } from "@cordon/fixtures";
import { site } from "../lib/links";
import { ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";

const TONE = {
  green: "positive",
  red: "critical",
  pending: "caution",
} as const;

export default function Drill() {
  useTitle("Drill · Cordon console");

  return (
    <>
      <ScreenHead
        title="The number this console is worth."
        lede="G3 measures the maximum an unrestricted agent can spend through the daemon. It has run, against the live tree, and the number is published whatever it says."
        note={`run ${DRILL.run.recordedAt.slice(0, 10)}`}
      />

      <Surface
        glaze="ember"
        radius="6"
        elevation="tile"
        glow
        grain
        sheen
        className="drill"
      >
        {/* The needle is the measurement. It read nothing until the drill had
            run, which was the honest state then and would be a lie now. */}
        <Gauge
          value={DRILL.reachedBps / 100}
          size={280}
          label={`Reached ${(DRILL.reachedBps / 100).toFixed(1)}% of the signed ceiling`}
          footnote={`${formatUsdc(DRILL.reached6)} of ${formatUsdc(DRILL.ceiling6)} signed ceiling`}
        >
          <span className="drill__readout mono">{DRILL.reachedBps / 100}%</span>
        </Gauge>
        <div>
          <Text variant="micro" tone="on-glaze" as="p" className="eyebrow">
            measured ceiling
          </Text>
          <p className="drill__statement">
            An agent told to spend everything reached {formatUsdc(DRILL.reached6)}.
          </p>
          <Tag tone="positive" size="sm" dot>
            stopped by {DRILL.stoppedBy.join(", ")}
          </Tag>
          <p className="pane__foot">
            It was stopped by a bound that was not the budget: one seller had
            been authorised {formatUsdc(DRILL.reached6)} of a ceiling allowing{" "}
            {formatUsdc(DRILL.ceiling6)}, which is the share that mandate
            declared for any one counterparty. Its own window still had money in
            it. Each refusal is a transaction, and each is in the registry.
          </p>
          <p className="pane__foot pane__foot--aside">
            <b>Authority reached, not money that left.</b> The drill ran before
            settlement was wired, so the windows above were debited and no
            purchase completed.
          </p>
          <p className="pane__foot">
            G4 has run: {SEARCH.strategies.toLocaleString()} strategies,{" "}
            {SEARCH.draws.toLocaleString()} draws, {SEARCH.passedABound} past a
            bound. The closest any of them got a root to was{" "}
            {formatUsdc(SEARCH.closestToBudget6)} of the{" "}
            {formatUsdc(SEARCH.budget6, 0)} root that run was scored against.
            Scored by the contract, never by a model of it.
          </p>
        </div>
      </Surface>

      {/* Figures only, and every one of them read from the run's own record.
          The argument for what they mean is on the public page and is not
          restated here: a sentence written twice is the defect this project
          keeps finding, and a number read from one fixture cannot drift. */}
      <Card>
        <CardHeader>
          <Text variant="micro" tone="dim" as="span" className="eyebrow">
            g7 · the work still gets done
          </Text>
          <Text variant="micro" tone="dim" as="span">
            {EVAL.runs} runs each · {EVAL.verdict.replace(/-/g, " ")}
          </Text>
        </CardHeader>
        {EVAL.scenarios.map((scenario) => (
          <div key={scenario.id}>
            <CardBody>
              <Text variant="micro" tone="dim" as="p" className="eyebrow">
                {scenario.id.replace(/-/g, " ")} · {scenario.workerShareBps / 100}% of the
                window each
              </Text>
            </CardBody>
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
                  cell: (condition) => `${condition.completed} of ${condition.runs}`,
                },
                {
                  id: "spent",
                  header: "Spent",
                  numeric: true,
                  cell: (condition) => formatUsdc(condition.spent6),
                },
                {
                  id: "runaway",
                  header: "Taken by the loop",
                  numeric: true,
                  cell: (condition) => formatUsdc(condition.runaway6),
                },
                {
                  id: "exposure",
                  header: "At risk before any work",
                  numeric: true,
                  cell: (condition) => formatUsdc(condition.exposureAtStart6),
                },
              ]}
            />
          </div>
        ))}
        <CardBody>
          <a href={site("/docs/gates#the-work")}>
            <Button variant="secondary" size="sm" iconEnd="arrow-right">
              What the two conditions are
            </Button>
          </a>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <Text variant="micro" tone="dim" as="span" className="eyebrow">
            gates
          </Text>
          <Text variant="micro" tone="dim" as="span">
            {GATES.filter((gate) => gate.status === "green").length} of{" "}
            {GATES.length} green
          </Text>
        </CardHeader>
        <DataTable
          rows={GATES}
          rowKey={(gate) => gate.id}
          columns={[
            {
              id: "id",
              header: "",
              width: 52,
              cell: (gate) => <span className="mono gate__id">{gate.id}</span>,
            },
            { id: "name", header: "Gate", cell: (gate) => <b>{gate.name}</b> },
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
                      {gate.tests} {gate.tests === 1 ? "test" : "tests"}
                    </Text>
                  )}
                </span>
              ),
            },
          ]}
        />
        <CardBody>
          <a href={site("/drill")}>
            <Button variant="secondary" size="sm" iconEnd="arrow-right">
              Public drill page
            </Button>
          </a>
        </CardBody>
      </Card>
    </>
  );
}
