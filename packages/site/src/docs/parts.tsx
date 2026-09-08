import type { ReactNode } from "react";

/**
 * The pieces a documentation page is built from.
 *
 * They exist so every page reads the same way and so that headings carry ids
 * without anybody remembering to add one. Nothing here animates: docs are read
 * on slow connections, in background tabs, and with a screen reader, and none
 * of those are places to make content wait for a frame.
 */

/** A heading, and the anchor the contents list points at. */
export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 className="doc__h2" id={id}>
      <a className="doc__anchor" href={`#${id}`} aria-label="Link to this section">
        #
      </a>
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 className="doc__h3" id={id}>
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="doc__p">{children}</p>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="doc__lead">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="doc__ul">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="doc__ol">{children}</ol>;
}

export function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div className="doc__code">
      {lang ? <span className="doc__code-lang">{lang}</span> : null}
      <pre className="mono">{children}</pre>
    </div>
  );
}

/** Inline code. Short enough to sit in a sentence. */
export function C({ children }: { children: ReactNode }) {
  return <code className="doc__inline mono">{children}</code>;
}

export type NoteTone = "info" | "warn" | "good";

export function Note({ tone = "info", title, children }: { tone?: NoteTone; title?: string; children: ReactNode }) {
  return (
    <aside className="doc__note" data-tone={tone}>
      {title ? <p className="doc__note-title">{title}</p> : null}
      <div className="doc__note-body">{children}</div>
    </aside>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="doc__table-wrap">
      <table className="doc__table">
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A short definition list, for things with a name and a meaning. */
export function Defs({ items }: { items: { term: ReactNode; def: ReactNode }[] }) {
  return (
    <dl className="doc__defs">
      {items.map((item, index) => (
        <div key={index}>
          <dt>{item.term}</dt>
          <dd>{item.def}</dd>
        </div>
      ))}
    </dl>
  );
}
