import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Logo, Text } from "cordon-ui";
import { ARC } from "@cordon/fixtures";
import { CONSOLE_URL } from "./links";

/**
 * The frame around the public record.
 *
 * These pages are the shareable half of Cordon — a seller reads one before
 * serving, an underwriter before pricing — so they get a plain masthead and a
 * footer rather than the landing's section nav, which points at a page they
 * are not on.
 */
function Masthead() {
  return (
    /* Named, because a page carries two of these — the site's banner and the
       page's own header — and a screen reader listing "banner, banner" is no
       more use than listing nothing. */
    <header className="top" aria-label="Cordon">
      <Link to="/" className="top__brand" aria-label="Cordon">
        <Logo size={19} />
        <Text variant="micro" tone="dim" as="span" className="top__mark">
          record
        </Text>
      </Link>
      <span className="top__spacer" />
      <div className="top__end">
        <a href={CONSOLE_URL}>
          <Button variant="primary" size="sm" magnetic>
            Launch console
          </Button>
        </a>
      </div>
    </header>
  );
}

export function RecordShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <Masthead />
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
