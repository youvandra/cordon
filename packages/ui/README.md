# @cordon/ui

The Cordon design system, vendored as source.

Derived from the shipped hero — see `design/system.md` at the repository root
for the rule that governs it. Nothing in here invents a value: the palette, the
two easing curves, the 17/429 corner ratio and the 0.12s stagger are that hero,
promoted to the level where a date picker can reach them.

It is source rather than a published package on purpose. This repository has to
build from a clone, and a `file:` dependency on a sibling directory does not.

Consumed through a Vite alias (`cordon-ui` → `packages/ui/index.ts`), so the
import path reads the same as it would from npm.
