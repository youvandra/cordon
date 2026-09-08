import { Preview, Text } from "cordon-ui";

/**
 * The console's screen header.
 *
 * `Preview` and `Enforced` used to be defined here as well, and stayed behind
 * as copies when they moved into the library — so the console was rendering an
 * older pair that knew nothing about the enforced/declared distinction. One
 * definition now, in `cordon-ui`, and this file keeps only the thing that is
 * genuinely console-shaped: a screen title with its preview label.
 */
export function ScreenHead({
  title,
  lede,
  note,
}: {
  title: React.ReactNode;
  lede?: React.ReactNode;
  note?: string;
}) {
  return (
    <header className="screen__head">
      <div>
        <h1 className="screen__title">{title}</h1>
        {lede ? (
          <Text variant="body" tone="copy" className="screen__lede">
            {lede}
          </Text>
        ) : null}
      </div>
      <Preview note={note} />
    </header>
  );
}
