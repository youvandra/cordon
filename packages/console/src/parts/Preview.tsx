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
  live = false,
  figures = true,
  actions,
}: {
  title: React.ReactNode;
  lede?: React.ReactNode;
  note?: string;
  /** Whether the figures under this head were read from the chain. */
  live?: boolean;
  /** False while there are no figures under it: a skeleton, or a read that
   *  failed. The badge then claims nothing about figures that are not there. */
  figures?: boolean;
  /**
   * What to do next, in the corner the label was in.
   *
   * A screen that has finished its own job has no state left to caption, and
   * the space is better spent on the two things the reader can do with what
   * they just made. Given actions, the label goes.
   */
  actions?: React.ReactNode;
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
      {actions ?? <Preview note={note} live={live} figures={figures} />}
    </header>
  );
}
