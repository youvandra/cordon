import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "cordon-ui";
import { SECTIONS } from "./nav";
import { CONSOLE_URL, GITHUB_URL } from "./links";
import { SiteNav } from "./SiteNav";

/**
 * The landing frame.
 *
 * The bar itself is `SiteNav`, which the docs and the record pages also use.
 * The only thing the landing asks of it is that it start on open paper and
 * earn its background by scrolling, because there is nothing under it until
 * the reader moves.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <SiteNav home="#top" lifted="onScroll" />

      <main id="top">{children}</main>

      <footer className="foot">
        <div className="foot__inner">
          <Logo name="Cordon" size={17} />
          <p className="foot__line">One budget for a tree of agents, enforced on chain.</p>
          <nav className="foot__links">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
            <Link to="/docs">Docs</Link>
            <Link to="/drill">Drill</Link>
            <Link to="/agent/41827">Record</Link>
            <a href={CONSOLE_URL}>Console</a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
          <p className="foot__meta">Arc testnet · preview build · no live money here</p>
        </div>
      </footer>
    </div>
  );
}
