import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Button, Logo } from "cordon-ui";
import { CONSOLE_URL, GITHUB_URL } from "../parts/links";
import { DOC_GROUPS, findPage, neighbours } from "./nav";

/**
 * The documentation frame: a contents list on the left, the page in the
 * middle, the headings of that page on the right.
 *
 * The right-hand list is built by reading the headings out of the page after
 * it renders. That order matters: the page is complete before anything looks
 * at it, so a browser that never runs the effect loses a convenience and never
 * loses the text.
 */
interface Heading {
  id: string;
  text: string;
}

function useHeadings(slug: string): Heading[] {
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    const found = Array.from(document.querySelectorAll<HTMLElement>(".doc__body .doc__h2"));
    setHeadings(found.map((node) => ({ id: node.id, text: node.textContent?.replace(/^#/, "") ?? "" })));
  }, [slug]);

  return headings;
}

export function DocsLayout({ children }: { children: ReactNode }) {
  const { slug = "introduction" } = useParams();
  const { pathname } = useLocation();
  const page = findPage(slug);
  const { prev, next } = neighbours(slug);
  const headings = useHeadings(slug);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = page ? `${page.title} · Cordon docs` : "Cordon docs";
  }, [page]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="docs">
      <header className="docs__top">
        <div className="docs__top-inner">
          <Link to="/" className="nav__brand" aria-label="Cordon">
            <Logo name="Cordon" size={19} />
          </Link>
          <span className="docs__mark">docs</span>

          <button
            className="docs__menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "Close" : "Contents"}
          </button>

          <div className="nav__end">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="nav__icon"
              aria-label="Cordon on GitHub"
            >
              <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true">
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
            </a>
            <a href={CONSOLE_URL}>
              <Button variant="primary" size="sm">
                Console
              </Button>
            </a>
          </div>
        </div>
      </header>

      <div className="docs__grid">
        <nav className={`docs__side${menuOpen ? " docs__side--open" : ""}`} aria-label="Documentation">
          {DOC_GROUPS.map((group) => (
            <div key={group.title} className="docs__group">
              <p className="docs__group-title">{group.title}</p>
              <ul>
                {group.pages.map((item) => (
                  <li key={item.slug}>
                    <Link
                      to={`/docs/${item.slug}`}
                      className={`docs__link${item.slug === slug ? " docs__link--active" : ""}`}
                      aria-current={item.slug === slug ? "page" : undefined}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <main className="docs__main">
          <article className="doc">
            {page ? (
              <header className="doc__head">
                <p className="doc__kicker">{groupOf(slug)}</p>
                <h1 className="doc__title">{page.title}</h1>
              </header>
            ) : null}

            <div className="doc__body">{children}</div>

            <nav className="doc__pager">
              {prev ? (
                <Link to={`/docs/${prev.slug}`} className="doc__pager-link">
                  <span className="doc__pager-dir">Previous</span>
                  <span className="doc__pager-title">{prev.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link to={`/docs/${next.slug}`} className="doc__pager-link doc__pager-link--next">
                  <span className="doc__pager-dir">Next</span>
                  <span className="doc__pager-title">{next.title}</span>
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </article>
        </main>

        <aside className="docs__toc" aria-label="On this page">
          {headings.length > 0 ? (
            <>
              <p className="docs__group-title">On this page</p>
              <ul>
                {headings.map((heading) => (
                  <li key={heading.id}>
                    <a href={`#${heading.id}`}>{heading.text}</a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function groupOf(slug: string): string {
  const group = DOC_GROUPS.find((candidate) => candidate.pages.some((page) => page.slug === slug));
  return group?.title ?? "Docs";
}
