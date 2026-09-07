import { Tag, Text } from "cordon-ui";

/**
 * Two labels this console may not be without.
 *
 * `Preview` says the figures are not chain reads. `Enforced` names the contract
 * function that produces the figure beside it — the rule from CLAUDE.md is that
 * no surface may display a number the contract does not enforce, so a figure
 * without one of these is a figure that should be deleted.
 */
export function Preview({ note }: { note?: string }) {
  return (
    <Tag tone="caution" size="sm" dot>
      frontend preview — {note ?? "figures are fixtures, not chain reads"}
    </Tag>
  );
}

export function Enforced({ children }: { children: React.ReactNode }) {
  return (
    <span className="enforced">
      <span className="enforced__dot" aria-hidden="true" />
      <span className="mono">{children}</span>
    </span>
  );
}

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
