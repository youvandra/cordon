import { Card, CardBody, Container, Grid, Headline, Skeleton, Stack, Text } from "cordon-ui";
import { RecordShell } from "./RecordShell";

/* ==========================================================================
   What a record page is while the chain is still answering.

   Three of these pages used to print a headline reading "Reading the record."
   over an empty page, and one of them — the attestation endpoint — filled the
   layout with the demo tree instead, so a real agent's page showed an
   imaginary agent's figures for as long as the fetch took and then swapped
   them out underneath the reader.

   A skeleton is the honest version of both: it says nothing, it says it in
   the shape of the answer, and nothing it shows can be mistaken for a figure.
   The blocks are the same widths as the content that replaces them, so the
   page does not jump when the answer lands.

   It never animates in a way that implies progress it does not have. The
   shimmer is the one in `cordon-ui`, which stops under `prefers-reduced-
   motion`.
   ========================================================================== */

export interface RecordSkeletonProps {
  /** The eyebrow is known before the answer is — it is in the URL. */
  eyebrow: string;
  /** Two lines, because every record headline here is two lines. */
  headline?: [string, string];
  /** A record page is a body and a column of figures; a refusal is one pane. */
  columns?: 1 | 2;
}

export function RecordSkeleton({ eyebrow, headline, columns = 2 }: RecordSkeletonProps) {
  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            {eyebrow}
          </Text>
          {/* The headline is ours, not the chain's, so it is printed rather
              than blocked out: a page that hides what it already knows reads
              as broken instead of as loading. */}
          <Headline lines={headline ?? ["Reading", "the record."]} />
          <Skeleton variant="text" lines={2} />
        </header>

        <Grid columns={columns} min={340} gap="lg" align="start">
          <Card>
            <CardBody>
              <Stack direction="column" gap="md" align="start">
                <Skeleton width="38%" height={12} />
                <Skeleton variant="text" lines={6} />
                <Skeleton width="52%" height={12} />
              </Stack>
            </CardBody>
          </Card>

          {columns === 2 ? (
            <Stack direction="column" gap="lg">
              <Card>
                <CardBody>
                  <Stack direction="column" gap="md" align="start">
                    <Skeleton width="46%" height={12} />
                    <Skeleton width="60%" height={44} />
                    <Skeleton variant="text" lines={3} />
                  </Stack>
                </CardBody>
              </Card>
              <Card>
                <CardBody>
                  <Stack direction="column" gap="md" align="start">
                    <Skeleton width="34%" height={12} />
                    <Skeleton variant="text" lines={4} />
                  </Stack>
                </CardBody>
              </Card>
            </Stack>
          ) : null}
        </Grid>
      </Container>
    </RecordShell>
  );
}
