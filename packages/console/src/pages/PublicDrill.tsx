import { Link } from "react-router-dom";
import {
  Button,
  CardBody,
  Container,
  DataTable,
  Headline,
  Surface,
  Tag,
  Text,
  Gauge,
} from "cordon-ui";
import { DRILL, GATES, MANDATE, formatUsdc } from "@cordon/fixtures";
import { Preview } from "../parts/Preview";
import { Section } from "../parts/Section";
import { PublicShell } from "../parts/Shell";
import { usePageMeta } from "../lib/meta";
import { useEntrance } from "../lib/entrance";

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
    title: "The hostile drill — Cordon",
    description:
      "An agent is given the daemon and told to spend as much as it can. Whatever it reaches is published, including the answer that disproves the product.",
  });
  const animate = useEntrance();
  const green = GATES.filter((gate) => gate.status === "green").length;

  return (
    <PublicShell>
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
            lines={["Told to spend everything,", "it reached — nothing yet."]}
          />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            An agent is given the daemon and a target, told to spend as much as
            it can, and neither restricted nor helped. Whatever it reaches is
            printed here — including the answer that disproves the product.
          </Text>
          <Preview note="G3 has not been run" />
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
              G4 plays {DRILL.strategiesPlanned.toLocaleString()} spend
              strategies against the contract, scored by the contract and never
              by a model of it. One that passes a bound is a bug, not a feature.
            </p>
          </div>
        </Surface>

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
    </PublicShell>
  );
}
