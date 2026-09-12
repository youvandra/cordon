# @cordon/ui

The Cordon design system, vendored as source.

Derived from the shipped hero: the palette, the two easing curves, the 17/429
corner ratio and the 0.12s stagger are that one tile, promoted to the level
where a date picker can reach them. **Nothing in here invents a value.**

It is source rather than a published package on purpose. This repository has to
build from a clone, and a `file:` dependency on a sibling directory does not.
Consumed through a Vite alias (`cordon-ui` → `packages/ui/index.ts`), so the
import path reads the same as it would from npm.

```tsx
import { CordonProvider, MetricCard, Enforced } from "cordon-ui";
```

The entry imports `styles/index.css` itself, so there is no second import to
forget and no way to ship a build with the components and not their stylesheet.

## What is in it

| | |
|---|---|
| `lib/primitives` | `Surface` (the glaze, the rim, the grain), `DotText` and the LED numerals, `Gauge`, `AnimatedNumber`, `Grain`, `CordonDefs` |
| `lib/components` | 30 of them — `Card` and `MetricCard`, `DataTable`, `Modal`, `Field` and the inputs, `Tag`, `Section`, `Enforced`, `Menu`, `Command`, `Sparkline`, `TileWall`, `Bento` |
| `tokens/` | `tokens.css` is every colour, space, radius and shadow; `motion.ts` and `spring.ts` are the curves |
| `styles/` | 25 stylesheets, one per component family, pulled in by `index.ts` as a single import |
| `hooks/` | the measured ones — focus trap, page meta, reduced motion, pointer field, measure |

## The rules a consumer inherits

**Every colour is a token.** A surface that writes a hex value has left the
system, and the two products in this repository define no colour of their own —
`console.css` is placement and nothing else.

**`Enforced` is not decoration.** It sets the contract function beneath a figure
in mono, and it exists because this project's first rule is that no surface may
display a number the contract does not enforce. A figure without one is a bug in
the page, not a styling choice.

**Colour means exception.** The accent is for a bound that fired, an amount that
was refused, a branch that was cut. A screen where most things are accented has
said nothing.

**Animation may not gate visibility.** `MetricCard` and `Headline` animate from
`opacity: 0`, and framer-motion drives on `requestAnimationFrame`, which does
not run in a hidden document. Anything that animates in must have a path that
puts it on screen without a frame ever running — the console's `entrance.ts` is
one implementation, with a failsafe that forces everything into view.

## Three things the material will not forgive

These are load-bearing geometry rather than preferences, and each one cost a
screen before it was written down.

- **`CardHeader` lays its children out in a column.** A header with a label on
  the left and a mark on the right is one row, so it has to be *one* child.
  Given two, it stacks them and stretches the tag across the card.
- **`MetricCard` is a rigid unit.** It positions its children at percentages of
  its own width and fixes the numeral at 28% of it, so the numeral's *height*
  falls out of its character count: a one-character value is drawn 1.4× taller
  than the slot above the caption and lands on top of it. Give it three
  characters or more, and keep `unit` to a word that is not one.
- **`Headline`'s dot-word slot is a fixed 4.851em** whatever goes in it, drawn
  for a word of about six characters. A three-character one is stretched to
  twice the glyph width and runs into the line below.

## Density

`data-cordon-density="compact"` on a shell tightens the whole system. The docs
offer the switch because trying all three is the point there; a product picks
one and sets it once.

## Using the system rather than its inventory

Importing the component list is not the same as using the system, and the
console's first rebuild only did the former: library components filled with
hand-written markup and 594 lines of local CSS. What was missing was the
devices — the tick ring, the LED numerals, the glass panel — which are what
make a surface look like this one rather than like a recolouring of somebody
else's. Two of the five are deliberately unused in the console, because a rail
that claims "step 2 of 4" asserts a journey nobody is on.
