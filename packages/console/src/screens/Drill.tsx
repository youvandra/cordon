import { Link } from "react-router-dom";
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
import { DRILL, GATES, formatUsdc } from "@cordon/fixtures";
import { ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";

const TONE = {
  green: "positive",
  red: "critical",
  pending: "caution",
} as const;

export default function Drill() {
  useTitle("Drill — Cordon console");

  return (
    <>
      <ScreenHead
        title="The number this console is worth."
        lede="G3 measures the maximum an unrestricted agent can spend through the daemon. It is published whatever it says."
        note="G3 not run"
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
        {/* The tick ring reading nothing. A gauge showing a plausible figure
            before the measurement exists is the single most tempting lie this
            project could tell, so the needle stays where it is. */}
        <Gauge
          value={0}
          size={280}
          label="Measured ceiling — not yet run"
          footnote={`0 — ${formatUsdc(DRILL.ceiling6, 0)} signed ceiling`}
        >
          <span className="drill__unset mono">—</span>
        </Gauge>
        <div>
          <Text variant="micro" tone="on-glaze" as="p" className="eyebrow">
            measured ceiling
          </Text>
          <p className="drill__statement">Unset until the drill has run.</p>
          <Tag tone="caution" size="sm" dot>
            pending
          </Tag>
          <p className="pane__foot">
            {DRILL.strategiesPlanned.toLocaleString()} strategies planned for
            G4, scored by the contract and never by a model of it.
          </p>
        </div>
      </Surface>

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
                      {gate.tests} tests
                    </Text>
                  )}
                </span>
              ),
            },
          ]}
        />
        <CardBody>
          <Link to="/drill">
            <Button variant="secondary" size="sm" iconEnd="arrow-right">
              Public drill page
            </Button>
          </Link>
        </CardBody>
      </Card>
    </>
  );
}
