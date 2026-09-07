import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Stack,
  Tag,
} from "cordon-ui";
import { ENFORCED_BY, formatUsdc } from "@cordon/fixtures";
import { REFUSALS, shortTx, txUrl, type Refusal } from "../lib/data";
import { Enforced, ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";

/**
 * No LED numerals on this screen. It is a list of decisions, and the rationing
 * rule is that the dot face belongs to a view's one hero figure — a list has
 * none, so these are ordinary tabular figures.
 */
function RefusalCard({ refusal }: { refusal: Refusal }) {
  const [released, setReleased] = useState(refusal.released);

  return (
    <Card>
      {/* CardHeader lays its children out in a column, so a label on the left
          and a mark on the right has to be one child, not two. Given two, it
          stacked them and stretched the tag to the full width of the card. */}
      <CardHeader>
        <Stack direction="row" justify="between" align="baseline" gap="md" wrap>
          <Stack direction="row" gap="sm" align="baseline" wrap>
            <span className="refusal__node">{refusal.nodeLabel}</span>
            <span className="mono refusal__at">{refusal.at}</span>
          </Stack>
          {released ? (
            <Tag tone="positive" size="sm">
              released by owner
            </Tag>
          ) : (
            <Tag tone="critical" size="sm" dot>
              refused
            </Tag>
          )}
        </Stack>
      </CardHeader>

      <CardBody>
        {/* The decision is one comparison — asked against allowed — so the two
            figures are set as that comparison rather than as two of four
            equal-weight fields. What it was for comes underneath. */}
        <div className="ask">
          <div className="ask__side">
            <span className="ask__label">requested</span>
            <span className="ask__value num">
              {formatUsdc(refusal.requested6)}
            </span>
          </div>
          <span className="ask__vs" aria-hidden="true">
            against
          </span>
          <div className="ask__side">
            <span className="ask__label">headroom</span>
            <span className="ask__value ask__value--short num">
              {formatUsdc(refusal.headroom6)}
            </span>
          </div>
        </div>

        <dl className="kv">
          <div>
            <dt>bound</dt>
            <dd>{refusal.boundLabel}</dd>
          </div>
          <div>
            <dt>counterparty</dt>
            <dd className="mono kv__break">{refusal.counterparty}</dd>
          </div>
        </dl>
      </CardBody>

      <CardFooter>
        {/* Emphasis follows consequence, not eagerness. Leaving the refusal
            standing costs nothing and is the safe default, so it reads as the
            plain choice; releasing spends past a bound the owner signed, so it
            carries the weight. `primary` on the release button was inviting the
            irreversible click. */}
        <Stack direction="row" gap="sm" align="center" wrap>
          <Button size="sm" variant="secondary" disabled={released}>
            Leave refused
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={released}
            onClick={() => setReleased(true)}
          >
            Sign to release
          </Button>
          <a href={txUrl(refusal.tx)} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary" iconEnd="external">
              {shortTx(refusal.tx)}
            </Button>
          </a>
          <span className="grow" />
          <Enforced>{ENFORCED_BY.release}</Enforced>
        </Stack>
      </CardFooter>
    </Card>
  );
}

export default function Refusals() {
  useTitle("Refusals — Cordon console");
  const released = REFUSALS.filter((refusal) => refusal.released).length;

  return (
    <>
      <ScreenHead
        title="Which node, how much, which bound."
        lede="Two buttons, no third option. A refusal consumes no budget; releasing is a named human signing from their own key, and it is logged."
        note="sample refusals; signing is mocked"
      />

      <Stack direction="row" gap="sm" align="center" wrap>
        <Tag tone="critical" size="sm">
          {REFUSALS.length - released} standing
        </Tag>
        <Tag tone="positive" size="sm">
          {released} released
        </Tag>
      </Stack>

      {/* Not a TileWall. A wall of one column is a list with a frame round it,
          and these cards are wide enough that one column is the right count. */}
      <Stack direction="column" gap="lg">
        {REFUSALS.map((refusal) => (
          <RefusalCard key={refusal.id} refusal={refusal} />
        ))}
      </Stack>
    </>
  );
}
