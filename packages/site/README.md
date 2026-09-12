# @cordon/site

The public website. Frontend only.

```bash
npm install
npm run dev      # http://localhost:5274
npm run build
```

One page, read in one scroll. `src/sections` holds the six sections in the
order they are read; `src/pages/Landing.tsx` is only their order.

It was five routes until the middle third of the landing became three cards
whose entire content was a summary of the page each linked to — reading the
site meant five loads and four summaries of things not yet read. The nav now
scrolls. `/mechanism`, `/arc`, `/record` and `/start` still resolve, as
redirects to the section, so links already in the brief do not 404.

Two rules every surface in this repository is written against:

- **Every figure comes from `@cordon/fixtures`.** Nothing here hardcodes a cap,
  a window, a price or a count.
- **No figure appears without the contract function that enforces it**, set in
  mono beneath it. That is the `.enforced` badge, and it is not decoration.

The design system is `@cordon/ui`, consumed as source through a Vite alias. The
landing deliberately departs from the library's default rhythm — larger type,
fewer words, one figure per idea — because a marketing page built to look like
a component gallery is a component gallery.

`DelegationTree` in `src/parts` is the one thing drawn from scratch: a leaf asks
for a tranche, the request travels up the filament, every ancestor is debited on
the way, and the root refuses. Run it with `cordoned={false}` for the
counterfactual — the same tree where every local check passes and nobody
computes the total.

## The other two thirds of this package

The landing is one route. Most of what is here is the documentation and the
pages the chain itself points at.

| Route | |
|---|---|
| `/` | the argument, in one scroll |
| `/docs` and `/docs/:slug` | 21 pages, in five groups |
| `/refusal/:id` | one refusal, and where it was published — the URL `ConductRecord` writes into every record |
| `/agent/:id` | a node's conduct, by ERC-8004 identity |
| `/attest/:id` | what the paid endpoint answers, as a page |
| `/drill` | G3 and G4 in public, whichever way they came out |

### The docs are a list, not a folder

`src/docs/nav.ts` is the table of contents, in reading order. The sidebar
renders it, the previous and next links walk it, `/docs` prints it with each
page's one-line summary, and the router builds a route per entry — so a page
that exists in `src/docs/pages` and not in that list is unreachable, and one in
the list with no component fails loudly rather than becoming a link to a blank
screen.

### Reading live records

| | |
|---|---|
| `VITE_METER_URL` | where `/refusal/:id` and `/agent/:id` read from. Unset, they fall back to the preview rows and say so |

`ConductRecord.RECORD_BASE` is a Solidity constant, so the ids in the registry
are the chain's rather than the illustration's. Pointing the build at the meter
is what makes those ids resolve; `ops/bin/cordon-publish.sh` sets it to `/api`
on the box's own origin.
