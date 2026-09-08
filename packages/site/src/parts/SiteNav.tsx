import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Logo } from "cordon-ui";
import { CONSOLE_URL, GITHUB_URL } from "./links";

/**
 * One bar, for all three shells.
 *
 * There used to be three of them: the landing's `.nav`, the docs' `.docs__top`
 * and the record's `.top`. They stood 62, 58 and 56 pixels tall, sat on three
 * different paper alphas, capped their content at three different widths, and
 * the same button read "Launch console" on two of them and "Console" on the
 * third. Nothing about that was a decision; it was three files written on
 * three days. A reader crossing from the landing to the docs to a record saw
 * the bar move under them each time, which is the cheapest possible way to
 * look like three products.
 *
 * So the bar is one component and the differences are arguments: how wide its
 * content may run, which word sits beside the mark, whether it lifts on scroll
 * or is lifted from the start, and whether the shell needs to put a control of
 * its own on the left.
 */
export interface SiteNavProps {
  /** The word beside the mark: "docs" on the docs, "record" on a record page. */
  mark?: string;
  /** Where the mark goes. The landing returns to its own top, not to a route. */
  home?: string;
  /**
   * How wide the bar's own content may run: the landing's 1180, the docs'
   * 1400, or the record pages' wide container. It has to end where the page
   * under it ends.
   */
  width?: "default" | "wide" | "page";
  /**
   * Lifted from the first frame. The landing starts on open paper and earns
   * its background by scrolling; every other surface has content under the bar
   * immediately, so starting transparent there is a flicker, not a reveal.
   */
  lifted?: "onScroll" | "always";
  /** A control the shell owns, before the links. The docs' contents toggle. */
  left?: ReactNode;
  /** Marks the Docs link as the page you are on. */
  current?: "docs";
}

export function SiteNav({
  mark,
  home = "/",
  width = "default",
  lifted = "always",
  left,
  current,
}: SiteNavProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (lifted !== "onScroll") return;
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lifted]);

  const isLifted = lifted === "always" || scrolled;
  const brand = (
    <>
      <Logo name="Cordon" size={19} />
      {mark ? (
        <span className="nav__mark" aria-hidden="true">
          {mark}
        </span>
      ) : null}
    </>
  );

  return (
    <header className={`nav${isLifted ? " nav--lifted" : ""}`}>
      <div className={`nav__inner${width === "default" ? "" : ` nav__inner--${width}`}`}>
        {/* An in-page hash is not a route, so the landing's own mark stays an
            anchor. Everywhere else it leaves the page it is on. */}
        {home.startsWith("#") ? (
          <a href={home} className="nav__brand" aria-label="Cordon">
            {brand}
          </a>
        ) : (
          <Link to={home} className="nav__brand" aria-label="Cordon">
            {brand}
          </Link>
        )}

        {left}

        <div className="nav__end">
          <Link
            to="/docs"
            className={`nav__link${current === "docs" ? " nav__link--current" : ""}`}
            aria-current={current === "docs" ? "page" : undefined}
          >
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
              Launch console
            </Button>
          </a>
        </div>
      </div>
    </header>
  );
}

/**
 * The GitHub mark, inline.
 *
 * The icon set in the library is drawn for the product's own vocabulary and
 * has no room for a third party logo, and a remote SVG would be one more
 * request for eighteen lines of path data. It lived in two files until the bar
 * became one component; two copies of a path is exactly the kind of second
 * copy this repository keeps finding.
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
