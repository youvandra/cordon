# @cordon/site

The public website. Frontend only.

```bash
npm install
npm run dev      # http://localhost:5274
npm run build
```

One page, read in one scroll. `src/sections` holds the nine sections in the
order they are read; `src/pages/Landing.tsx` is only their order.

It was five routes until the middle third of the landing became three cards
whose entire content was a summary of the page each linked to — reading the
site meant five loads and four summaries of things not yet read. The nav now
scrolls. `/mechanism`, `/arc`, `/record` and `/start` still resolve, as
redirects to the section, so links already in the brief do not 404.

Two rules it inherits from the root `CLAUDE.md`:

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
