import { useEffect } from "react";
import { ARC } from "@cordon/fixtures";

/**
 * Per-route document metadata.
 *
 * `document.title` alone is half the job. A single-page app that never touches
 * the description leaves every route claiming to be whatever index.html said —
 * so `/agent/41827` was describing itself as the owner console — and a link
 * pasted into a chat unfurls as a bare URL because there are no Open Graph
 * tags at all. Both matter here: the record pages exist to be shared.
 */
function upsert(selector: string, create: () => HTMLElement, value: string) {
  let node = document.head.querySelector(selector) as HTMLElement | null;
  if (!node) {
    node = create();
    document.head.appendChild(node);
  }
  if (node instanceof HTMLMetaElement) node.content = value;
  else node.setAttribute("href", value);
}

function meta(name: string) {
  const el = document.createElement("meta");
  el.setAttribute("name", name);
  return el;
}

function property(name: string) {
  const el = document.createElement("meta");
  el.setAttribute("property", name);
  return el;
}

export interface PageMeta {
  title: string;
  description: string;
}

export function usePageMeta({ title, description }: PageMeta) {
  useEffect(() => {
    document.title = title;

    upsert('meta[name="description"]', () => meta("description"), description);
    upsert('meta[property="og:title"]', () => property("og:title"), title);
    upsert('meta[property="og:description"]', () => property("og:description"), description);
    upsert('meta[property="og:type"]', () => property("og:type"), "website");
    upsert('meta[property="og:url"]', () => property("og:url"), window.location.href);
    /* Unfurlers do not resolve relative image paths, so the absolute one is
       written at runtime rather than guessed at build time. */
    upsert(
      'meta[property="og:image"]',
      () => property("og:image"),
      `${window.location.origin}/og-image.png`,
    );
    upsert('meta[name="twitter:image"]', () => meta("twitter:image"), `${window.location.origin}/og-image.png`);
    upsert('meta[name="twitter:card"]', () => meta("twitter:card"), "summary");
    upsert('meta[name="twitter:title"]', () => meta("twitter:title"), title);
    upsert('meta[name="twitter:description"]', () => meta("twitter:description"), description);

    /* Query strings never change what these pages show, so the canonical is
       always the bare path. */
    upsert('link[rel="canonical"]', () => {
      const el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      return el;
    }, `${window.location.origin}${window.location.pathname}`);
  }, [title, description]);
}

/** The console is an owner surface; it should not be indexed. */
export function useNoIndex(on: boolean) {
  useEffect(() => {
    const el = document.head.querySelector('meta[name="robots"]') ?? document.createElement("meta");
    el.setAttribute("name", "robots");
    el.setAttribute("content", on ? "noindex, nofollow" : "index, follow");
    if (!el.parentNode) document.head.appendChild(el);
  }, [on]);
}

export const CHAIN_SUFFIX = `Arc ${ARC.chainId}`;
