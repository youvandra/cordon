import type { ComponentType } from "react";
import { Navigate, useParams } from "react-router-dom";
import { DocsLayout } from "./DocsLayout";
import { findPage } from "./nav";
import { HowItWorks, Introduction, Quickstart } from "./pages/start";
import { DocsIndex, Integrate, Walkthrough } from "./pages/integrate";
import { Console, Settlement, Troubleshooting } from "./pages/settlement";
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
  settlement: Settlement,
  mcp: Mcp,
  proxy: Proxy,
  daemon: Daemon,
  meter: Meter,
  attest: Attest,
  console: Console,
  contracts: Contracts,
  configuration: Configuration,
  gates: Gates,
  troubleshooting: Troubleshooting,
  faq: Faq,
};

export default function Docs() {
  const { slug } = useParams();

  /* `/docs` itself is the contents, not a redirect into the first page: the
     summaries in `nav.ts` are written for a reader deciding where to go, and
     until this existed there was nowhere they were read. */
  if (!slug) {
    return (
      <DocsLayout>
        <DocsIndex />
      </DocsLayout>
    );
  }

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
