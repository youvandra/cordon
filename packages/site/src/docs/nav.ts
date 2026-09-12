/**
 * The docs, as a table of contents.
 *
 * One list, in reading order. The sidebar renders it, the previous and next
 * links walk it, and the router builds a route per page from it, so a page
 * that exists here and nowhere else fails loudly rather than becoming a link
 * to a blank screen.
 */
export interface DocPage {
  slug: string;
  title: string;
  /** One line, shown on the docs index. */
  summary: string;
}

export interface DocGroup {
  title: string;
  pages: DocPage[];
}

export const DOC_GROUPS: DocGroup[] = [
  {
    title: "Start here",
    pages: [
      {
        slug: "introduction",
        title: "Introduction",
        summary: "What Cordon is, what it refuses to claim, and who it is for.",
      },
      {
        slug: "quickstart",
        title: "Quickstart",
        summary: "Run the fence in front of Claude Desktop in about a minute.",
      },
      {
        slug: "how-it-works",
        title: "How it works",
        summary: "The path a single purchase takes, from the agent to the seller.",
      },
      {
        slug: "walkthrough",
        title: "Step by step",
        summary: "From an empty wallet to an agent that has bought and been refused.",
      },
      {
        slug: "integrate",
        title: "Integrate with your agent",
        summary: "MCP, a proxy or plain HTTP, the skill file, and handling a refusal.",
      },
    ],
  },
  {
    title: "Concepts",
    pages: [
      {
        slug: "mandate-tree",
        title: "The mandate tree",
        summary: "Roots, children, narrowing, and why a parent may spawn on its own.",
      },
      {
        slug: "draws-and-bounds",
        title: "Draws and bounds",
        summary: "The five bounds on every tranche, and the figures they leave behind.",
      },
      {
        slug: "refusals",
        title: "Refusals, release, revocation",
        summary: "What happens when a bound is reached, and the ways out.",
      },
      {
        slug: "the-record",
        title: "The record",
        summary: "Conduct written into a shared registry, linked to the transaction.",
      },
    ],
  },
  {
    title: "Surfaces",
    pages: [
      {
        slug: "mcp",
        title: "MCP server",
        summary: "Three tools, and the one that is deliberately missing.",
      },
      {
        slug: "proxy",
        title: "Proxy and cordon run",
        summary: "Put the fence in front of a program you cannot change.",
      },
      {
        slug: "daemon",
        title: "Daemon",
        summary: "The core. It holds the key; everything else forwards to it.",
      },
      {
        slug: "meter",
        title: "Meter",
        summary: "The indexer and its read API, rebuildable from chain.",
      },
      {
        slug: "attest",
        title: "Attest",
        summary: "The record, priced: one x402 call before a seller serves an agent.",
      },
    ],
  },
  {
    title: "Reference",
    pages: [
      {
        slug: "contracts",
        title: "Contracts",
        summary: "MandateRegistry, TreeVault, ConductRecord, and the events they emit.",
      },
      {
        slug: "configuration",
        title: "Configuration",
        summary: "Every environment variable each package reads.",
      },
      {
        slug: "gates",
        title: "Gates",
        summary: "The acceptance criteria, and the numbers the runs produced.",
      },
      {
        slug: "faq",
        title: "FAQ",
        summary: "The questions that come up first, answered plainly.",
      },
    ],
  },
];

export const DOC_PAGES: DocPage[] = DOC_GROUPS.flatMap((group) => group.pages);

export function findPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

export function neighbours(slug: string): { prev?: DocPage; next?: DocPage } {
  const index = DOC_PAGES.findIndex((page) => page.slug === slug);
  if (index < 0) return {};
  return { prev: DOC_PAGES[index - 1], next: DOC_PAGES[index + 1] };
}
