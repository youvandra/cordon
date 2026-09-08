import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Logo } from "cordon-ui";
import { SECTIONS } from "./nav";
import { CONSOLE_URL, GITHUB_URL } from "./links";

/**
 * The bar carries three things: the name, where to read, and where to sign in.
 *
 * It used to list the page's own sections. On a single page that is a menu of
 * places the reader has not been given a reason to go yet, and it competed
 * with the one link that matters before anything else, which is the docs.
 */
export function Shell({ children }: { children: ReactNode }) {
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="shell">
      <header className={`nav${lifted ? " nav--lifted" : ""}`}>
        <div className="nav__inner">
          <a href="#top" className="nav__brand" aria-label="Cordon">
            <Logo name="Cordon" size={19} />
          </a>

          <div className="nav__end">
            <Link to="/docs" className="nav__link">
              Docs
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="nav__icon"
              aria-label="Cordon on GitHub"
            >
              <GithubMark />
            </a>
            <a href={CONSOLE_URL}>
              <Button variant="primary" size="sm" magnetic>
                Console
              </Button>
            </a>
          </div>
        </div>
      </header>

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

/**
 * The GitHub mark, inline.
 *
 * The icon set in the library is drawn for the product's own vocabulary and
 * has no room for a third party logo, and a remote SVG would be one more
 * request for eighteen lines of path data.
 */
function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
           0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
           -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
           .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
           -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0
           1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
           1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
           1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}
