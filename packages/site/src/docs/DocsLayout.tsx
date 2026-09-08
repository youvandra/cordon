import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { SiteNav } from "../parts/SiteNav";
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
      <SiteNav
        mark="docs"
        width="wide"
        current="docs"
        left={
          <button
            className="docs__menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "Close" : "Contents"}
          </button>
        }
      />

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
