import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo, Text } from "cordon-ui";
import { ARC } from "@cordon/fixtures";
import { SiteNav } from "./SiteNav";

/**
 * The frame around the public record.
 *
 * These pages are the shareable half of Cordon: a seller reads one before
 * serving, an underwriter before pricing. They used to carry a masthead of
 * their own, one that stood shorter than the landing's bar, sat on a different
 * paper alpha and dropped both the docs link and the repository. It is
 * `SiteNav` now, with "record" beside the mark, so crossing from the landing
 * to a record does not move the furniture.
 */
export function RecordShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <SiteNav mark="record" width="page" />
      <main id="content" className="public">
        {children}
      </main>

      <footer className="foot">
        <div className="foot__inner">
          <Logo size={16} />
          <Text variant="micro" tone="dim" as="p">
            One budget for a tree of agents, enforced on chain. Arc testnet ·
            nothing here is live money.
          </Text>
          <nav aria-label="Cordon" className="foot__links">
            <Link to="/">The argument</Link>
            <Link to="/drill">The hostile drill</Link>
            <Link to="/agent/41827">A conduct record</Link>
            {/* Reachable by a human, not only by a registry reader following
                `ConductRecord.RECORD_BASE`. A page nothing links to is a page
                nobody looks at, which is how the `SURFACES` fixture sat here
                for a week describing a shipped surface as pending. */}
            <Link to="/refusal/3">One refusal</Link>
            <a href={ARC.explorer} target="_blank" rel="noreferrer">
              Arc explorer
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
