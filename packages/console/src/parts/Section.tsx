import { useId } from "react";
import type { ReactNode } from "react";
import { Card, CardHeader, Stack, Text } from "cordon-ui";

/**
 * A block of the page, as a block of the document.
 *
 * Every block on these pages was a `div` labelled by a `span`, which meant an
 * 1,800-character record had exactly one heading and no sections: the outline
 * a screen reader, a reader-mode view or a crawler gets was a title and then a
 * wall. A block with a name is a `section` with a heading, and the heading is
 * an `h2` because the page's own title is the `h1`.
 *
 * `Card` renders a div and takes no `as`, so the section wraps it rather than
 * replacing it — the landmark is structural and costs nothing visually.
 */
export function Section({
  title,
  aside,
  children,
  bare = false,
}: {
  title: ReactNode;
  /** Sits opposite the heading — a count, a contract function, a link. */
  aside?: ReactNode;
  children: ReactNode;
  /** For content that brings its own surface and wants no Card around it. */
  bare?: boolean;
}) {
  const id = useId();

  const heading = (
    <Stack direction="row" justify="between" align="baseline" gap="md" wrap>
      <Text variant="micro" tone="dim" as="h2" id={id} className="eyebrow">
        {title}
      </Text>
      {aside}
    </Stack>
  );

  if (bare) {
    return (
      <section aria-labelledby={id} className="block">
        {heading}
        {children}
      </section>
    );
  }

  return (
    <section aria-labelledby={id}>
      <Card>
        <CardHeader>{heading}</CardHeader>
        {children}
      </Card>
    </section>
  );
}
