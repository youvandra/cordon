import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Logo } from "cordon-ui";
import { ARC } from "@cordon/fixtures";
import { SECTIONS } from "./nav";
import { CONSOLE_URL } from "./links";
import type { SectionId } from "./nav";

/**
 * Which section the reader is in.
 *
 * Decoration only — it moves a highlight. It is allowed to depend on a frame
 * loop, unlike anything that decides whether content is visible at all.
 */
function useCurrentSection(): SectionId | null {
  const [current, setCurrent] = useState<SectionId | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const seen = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.intersectionRatio);
        const [best] = [...seen.entries()]
          .filter(([, ratio]) => ratio > 0)
          .sort((a, b) => b[1] - a[1]);
        setCurrent((best?.[0] as SectionId) ?? null);
      },
      { threshold: [0, 0.15, 0.4, 0.75], rootMargin: "-20% 0px -55% 0px" },
    );

    const targets = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (node): node is HTMLElement => node !== null,
    );
    targets.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return current;
}

export function Shell({ children }: { children: ReactNode }) {
  const [lifted, setLifted] = useState(false);
  const [open, setOpen] = useState(false);
  const current = useCurrentSection();

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

          {/* The site is one page, so these move the reader rather than
              fetching anything. */}
          <nav className={`nav__links${open ? " nav__links--open" : ""}`}>
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`nav__link${current === section.id ? " nav__link--active" : ""}`}
                aria-current={current === section.id ? "true" : undefined}
                onClick={() => setOpen(false)}
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div className="nav__end">
            <a href="#start">
              <Button variant="primary" size="sm" magnetic>
                Run it
              </Button>
            </a>
            <button
              className="nav__toggle"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((state) => !state)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <main id="top">{children}</main>

      <footer className="foot">
        <div className="foot__inner">
          <Logo name="Cordon" size={17} />
          <p className="foot__line">
            One budget for a tree of agents, enforced on chain.
          </p>
          <nav className="foot__links">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
            {/* The public record and the gated surface. Everything above this
                argues; these two are the thing itself. */}
            <Link to="/drill">Drill</Link>
            <Link to="/agent/41827">Record</Link>
            <a href={CONSOLE_URL}>Console</a>
          </nav>
          <p className="foot__meta">
            Arc testnet {ARC.chainId} · frontend preview · nothing here is live money
          </p>
        </div>
      </footer>
    </div>
  );
}
