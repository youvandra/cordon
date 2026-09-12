import type { ComponentType } from "react";
import { Navigate, useParams } from "react-router-dom";
import { DocsLayout } from "./DocsLayout";
import { findPage } from "./nav";
import { HowItWorks, Introduction, Quickstart } from "./pages/start";
import { Integrate, Walkthrough } from "./pages/integrate";
import { DrawsAndBounds, MandateTree, Refusals, TheRecord } from "./pages/concepts";
import { Attest, Daemon, Mcp, Meter, Proxy } from "./pages/surfaces";
import { Configuration, Contracts, Faq, Gates } from "./pages/reference";

/**
 * Slug to page. Every entry in the contents list has one, and the router only
 * renders slugs that are in the list, so a page can never be half added.
 */
const PAGES: Record<string, ComponentType> = {
  introduction: Introduction,
  quickstart: Quickstart,
  "how-it-works": HowItWorks,
  walkthrough: Walkthrough,
  integrate: Integrate,
  "mandate-tree": MandateTree,
  "draws-and-bounds": DrawsAndBounds,
  refusals: Refusals,
  "the-record": TheRecord,
  mcp: Mcp,
  proxy: Proxy,
  daemon: Daemon,
  meter: Meter,
  attest: Attest,
  contracts: Contracts,
  configuration: Configuration,
  gates: Gates,
  faq: Faq,
};

export default function Docs() {
  const { slug = "introduction" } = useParams();
  const Page = PAGES[slug];

  /* An unknown slug goes to the front of the docs rather than to a site wide
     404: the reader is inside the documentation and a broken link there is
     almost always a stale bookmark. */
  if (!Page || !findPage(slug)) return <Navigate to="/docs/introduction" replace />;

  return (
    <DocsLayout>
      <Page />
    </DocsLayout>
  );
}
