# @cordon/console

![Cordon](../brand/export/banner.png)

The owner surface, and the public record. Frontend only.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## What is here

Four screens behind the wallet gate, and four pages in front of it. The public
pages are where the chain sends people: `ConductRecord` writes
`getcordon.xyz/refusal/<id>` into every record it publishes.

| Route | |
|---|---|
| `/console/setup` | sign one mandate, fund the vault once |
| `/console/tree` | live exposure across the whole tree |
| `/console/refusals` | which node, how much, which bound |
| `/console/drill` | G3's number, and the gate register |
| `/agent/:id` | the public conduct record |
| `/refusal/:id` | one refusal, and where it was published — the URL the chain itself writes |
| `/drill` | the hostile drill, in public |
| `/attest/:id` | the x402 endpoint, as a page |

`/` opens the console. The argument for the project is `@cordon/site`, and a
second landing page restating it is a second place for it to go stale.

## What it is built from

`@cordon/ui`, consumed as source through a Vite alias — the same resolution
`@cordon/site` uses, and for the same reasons, written out in `vite.config.ts`.

Importing the library's inventory is not the same as using the system, and the
first attempt at this rebuild only did the former: library components filled
with hand-written markup and 594 lines of local CSS. The library's own README
names that failure — *recolouring generic components is how a system ends up
looking borrowed*. What was missing was the devices.

| Device | Where it does the work here |
| --- | --- |
| **Tick ring** — `Gauge` | the drill's measured ceiling, reading nothing |
| **LED numerals** — `MetricCard` | rationed to one hero figure per view, and nowhere else |
| **Glass panel** | the select list on Setup |

Two of the five devices are not here, and that is the point. `StepProgress` is
a rail for a sequence, and the four screens are navigation — you go to Tree,
then Refusals, then back to Tree — so a rail claiming "step 2 of 4" asserts a
journey nobody is on. `TileWall` sets cards into a wall, and a wall of one
column is a list with a frame round it. Both were here, and both were here
because the system has them, which is the wrong reason.

The bar takes the docs shell's *material* — 56px, paper at 72% under the same
blur, the same hairline — and almost nothing else. It carried, at various
points, a 380px search box, a command palette, a density switcher, a chain-id
badge and the name of the screen you were already looking at, which the sidebar
was highlighting and the screen's own heading was stating.

What is left is the product's name, whether the money is real, and who is
signed in. The environment badge is the one piece of state in that bar that
changes what a click costs, which is why it survived and the chain id — printed
by every explorer link on the page — did not.

The command palette went with them. Four screens are in the sidebar and seven
nodes are in a table on the screen; the one thing it reached that nothing else
did was an agent's public record, so the node's name in the tree table is now
the link. A shortcut is not a good place to keep the only route to something.

Density is `compact` and is not a control. The docs offer the switch because
trying all three is the point there; a product picks one.

`Bento` carries the supporting figures beside a hero, `Container` and `Grid`
own the page geometry, `Card` is every content block, and `Headline` sets the
public titles with their dot-word. `data-cordon-density="compact"` is set once
on the console shell, because a surface read all day is what that knob is for.

`src/console.css` places those components and defines no colour of its own:
every value is a token. It is under 500 lines and the deleted half came back as
components, which is the honest measure of whether a design system is being
used or worked around.

### Document structure

The pages were a flat pile before this: a 1,800-character record had one
heading and no sections, every block was a `div` labelled by a `span`, and the
outline a screen reader, a reader-mode view or a crawler saw was a title and
then a wall.

- One `h1` per route, then `h2` per named block, no skipped levels. `MetricCard`
  sets its own title as an `h3`, so a page that put a tile straight under its
  title jumped `h1 → h3`; each figure block now carries the heading between.
- Named blocks are `<section aria-labelledby>` — that is what `parts/Section`
  is, and why it exists rather than another `Card` with a `span` on top.
- One `<main id="content">`, a skip link as the first thing in the tab order,
  the banner named (a page carries two `header`s and "banner, banner" helps
  nobody), and a `<footer>` on the public pages.
- Per-route `title`, `description`, Open Graph and canonical, because a SPA
  that only sets `document.title` leaves `/agent/41827` describing itself as
  the owner console and unfurling as a bare URL wherever it is pasted. The
  console is `noindex`; the public pages are not.
- `EmptyState` renders its title as a paragraph, so the 404 had no heading at
  all. It has a visually-hidden `h1` now.

`DataTable`'s header cells had no `scope`, which is fixed in the library rather
than worked around here — without it a header is not announced as the label for
the cells under it, which is the whole reason a table is a table.

### Placement rules this console follows

- **Emphasis follows consequence.** Releasing a refusal spends past a bound the
  owner signed; leaving it standing costs nothing. So the safe choice is the
  plain one and the release carries the weight. `primary` on the release button
  was inviting the irreversible click.
- **A destructive action does not sit beside a routine one.** On the sample
  tree, draw is in the row and revoking a subtree is behind the kebab, which is
  the glyph for actions on a single row: two same-size targets eight pixels
  apart, one of which kills a branch, is a misclick waiting. The chain table has
  no routine action to sit beside — so the revoke is the row's one control, and
  it asks before it signs.
- **One truth, one place.** Setup's right column used to repeat the five values
  the form beside it already held.
- **The result appears where the eye is.** Signing swaps the column's lead card
  for the handoff, rather than adding a third card below the fold.
- **Thesis before evidence.** The record's one comparison comes before its
  figures; it used to sit third, which asked the reader to hold four numbers in
  mind before being told what they were for.
- **A comparison is set as one.** "Requested against headroom" on a shared
  baseline, not two of four equal fields.

### Three things the material will not forgive

`CardHeader` lays its children out in a column. A header with a label on the
left and a mark on the right is one row, so it has to be *one* child — given
two, it stacks them and stretches the tag across the whole card.



`MetricCard` is a rigid unit: it positions its children at percentages of its
own width, and fixes the numeral's width at 28% of it. So the numeral's
*height* falls out of its character count — a one-character value is drawn 1.4x
taller than the slot above the caption and lands on top of it. Give it three
characters or more. A word-length `unit` does the same damage sideways.

`Headline`'s dot-word slot is a fixed `4.851em` wide whatever goes in it, so
it is drawn for a word of about six characters. A three-character one is
stretched to twice the glyph width and runs into the line below.

`MetricCard` and `Headline` animate from `opacity: 0` by default, and
framer-motion drives on requestAnimationFrame, which does not run in a hidden
document. `src/lib/entrance.ts` therefore animates only when the tab was
visible at mount, with a 1.6s failsafe that forces everything into view. This
is this project's own rule: animation may not gate visibility.

## The two rules every surface here is written against

- **Every figure comes from `@cordon/fixtures`.** `src/lib/data.ts` is the one
  exception and says so at the top: it is a shaped sample of what the indexer
  will return, built out of fixtures, and no line of it is a chain read.
- **No figure appears without the contract function that enforces it.** That is
  the `.enforced` mark, and it is not decoration.

## Two paths, and the console says which one you are on

**With a wallet.** `VITE_PRIVY_APP_ID` turns the gate real: Privy holds the
key, the owner logs in, and the address on screen is one that can sign on Arc.
Opening a mandate, funding the vault, spawning a child, revoking a branch and
releasing a refusal are then transactions from that key — each simulated first,
so an owner who is not the owner of a node is told before a wallet asks them to
sign anything. The tree and its figures are read from the registry and the
vault directly, with no indexer in between, because node ids are derived and
every node under an owner is reachable from that owner's address.

Privy holds the key; Cordon holds the bound. They answer different questions —
who may sign, and what may be signed for — and a policy inside the service that
holds a key is an off-chain control, which this project calls `declared`.

**Without one.** The gate falls back to a preview that touches no key:
`sessionStorage`, no signature, and every surface that depends on it says so.
The tree it shows is still the live one on Arc — it is not a tree of invented
agents — and what it does not have is any control that would fail at a wallet
nobody connected.

The one screen that is genuinely a drawing is the **sample tree**, shown when
no root has been opened: its `Draw $1` button and its revocations are local
state. They demonstrate the single thing worth demonstrating, which is that a
draw on a grandchild moves its grandparent's figure.

On the chain path there is **no draw control at all**. A draw is the daemon's
to make, and a button that pretended to make one from a table would be the
surface lying about what it can do. Revoking is different: it is the owner's
own transaction, and it is in the row.

## Two environment variables

| | |
|---|---|
| `VITE_PRIVY_APP_ID` | build-time. Unset, the wallet gate is the preview above — which looks like nothing is wrong |
| `VITE_METER_URL` | where `/refusal/:id` and the refusals list read from. Unset, the console reads the chain in windows and says how far back it got |

The drill gauge reads what G3 reached: 35.0% of the signed ceiling,
$0.007000 of $0.020000, stopped by `concentration` while the window still had
money in it. It is drawn from `drill.gen.ts`, which the run writes and nobody
types, and the figure is authority the tree granted rather than money that
left — no payment settled.
