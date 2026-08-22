---
paths:
  - core/components/src/state/virtualized-list*.ts
  - adapters/*/src/components/virtualized-*/**
---

<!-- Five independent failures live here, and the last one was the INSTRUMENT. Both surfaced as "the list jumps while scrolling", both
     were found by putting numbers on a device screen, and fixing one never touched the next.
     Read all four before changing anything about spacers, cell markup, or a measurement guard. -->

# The list offset table is a closed loop — never combine two measurements inside it

`buildOffsets` is not a pure function of the host's measurements. Its output sizes the leading
spacer, the host lays the window's cells out below that spacer, and their `onLayout.y` — spacer
included — comes straight back in as the next input. Output → layout → input → output.

**The rule that keeps that loop stable: a measured cell is placed at its reported offset VERBATIM.**
Never re-based onto a running sum, never derived from a neighbour's offset, never normalized so
index 0 sits at zero. This is react-native's own model (`ListMetricsAggregator.getCellMetricsApprox`
returns a laid-out cell's frame untouched), and the reason is arithmetic, not taste.

## What differencing two measurements costs

Measured on device 2026-08-19 and reproduced headlessly. A version of `buildOffsets` carried an
ANCHOR — `running = anchorModel + (rawOffset - anchorRaw)` — to capture the distance between two
cells rather than summing heights. The intent was right (a height is not the distance to the next
cell). The mechanism was not:

A spacer is an **extra flex child**. With a Yoga `gap` on the content container (the canary's
`.grid` has `gap: 12px`) its mere presence shifts the layout by one more gap than any pure
arithmetic predicts. Difference two cells measured either side of that change and the table banks
the gap. The result feeds the next pass. Measured:

```
pass=5   first=1   lead=112    truth=112    err=0
pass=10  first=10  lead=1180   truth=1120   err=60
pass=20  first=27  lead=3204   truth=3024   err=180
pass=39  first=58  lead=6904   truth=6496   err=408
```

Exactly +1 gap per recompute, monotonic, unbounded. `onScroll` fires per frame, so within a second
of dragging the spacer is thousands of pixels from reality and the window lands nowhere near the
viewport. On screen: scrolling is smooth, then the content jumps up and every cell disappears, with
`onViewableItemsChanged` reporting an empty set. Both FlatList and SectionList, every adapter.

## Spacers are region differences, not offsets

`buildListPlan` sizes a spacer as `offsets[to] + lengths[to] - offsets[from]` over the run of cells
it replaces — RN's `lastMetrics.offset + lastMetrics.length - firstMetrics.offset`. Both endpoints
are positions the host reported, so whatever chrome sits between those cells is carried without the
model knowing it exists, and the spacer lands the following cell exactly where it already was: it
occupies one child slot, and the region it replaces began and ended on a cell boundary. Using
`offsets[first]` directly instead is short by one gap and re-opens the loop.

## Estimates stay in their lane

Unmeasured cells are the only place an estimate belongs. They advance by
`length + (averageStride - averageLength)` — the cell's own known height plus the average chrome
BETWEEN cells. Advancing by the stride alone overwrites a height that was actually measured;
advancing by the length alone under-reserves the region by its chrome, which is the jump-and-return
that started this whole thread.

## Offsets live in the HOST's space

Because measured values are kept verbatim, `offsets[i]` includes the container padding and the list
header — the same space `contentOffset.y` is reported in. That is a feature: `computeWindow`,
viewability and `scrollToIndex` all compare against `scrollOffset`, and before this change every one
of them was off by the header's height. A `getItemLayout` table is the documented exception — its
offsets are the caller's, exclude the header, and RN has the same seam.

## The test that catches it

`core/components/src/state/virtualized-list-feedback.test.ts` runs the loop closed: derive → size
the spacer → lay the cells out below it with a `gap` → feed the measurements back, 40 times, and
assert the error never grows. A unit test of `buildOffsets` in isolation cannot see any of this —
the broken version passed 207 of them. If a geometry change is only covered by single-shot unit
tests, it is not covered.

# A separator is part of its CELL, never a sibling of it

RN renders `ItemSeparatorComponent` INSIDE the cell's own measuring wrapper
(`VirtualizedListCellRenderer.js:218-221`):

```jsx
<View onLayout={this._onLayout}>
  {element}
  {itemSeparator}
</View>
```

Every adapter here had it as a SIBLING instead — ported from one another, so all five were wrong
together. That placement is geometry, not decoration, and it costs a visible jump on every window
step.

## Why a sibling breaks the spacer

A separator as a sibling is an extra flex child, so with a container `gap` the chrome between two
cells is `gap + separator + gap`. A spacer collapsing a run of cells is ONE child, contributing
`spacer + gap`. Work the two out against each other and the leading spacer is short by exactly
`separator + gap` — the region formula measures cell-boundary to cell-boundary and cannot see the
chrome sitting between the region and the first rendered cell.

Device-measured 2026-08-19 on `examples/solid`, Sections tab: `.content { gap: 16px }` with a 1px
divider, and the content shifted by exactly **17.00** every time the window's first index moved,
sign following the scroll direction. The HUD showed 8 consecutive cells all moving by the identical
amount, `RESID 0.00` throughout, and not a single `LEN` entry — nothing resized, the structure
above them changed.

Inside the wrapper, the separator folds into the cell's measured length, the child count stays at
exactly one per cell, and the region difference is exact again. `buildListPlan` therefore no longer
takes `hasSeparators`: sticky child positions are `+1` per cell, full stop.

## Counting separators is not testing them

`renders a separator between cells but not after the last one` counted dividers in the flattened
committed tree and passed identically before and after the move — as did all 3759 other tests. A
structural claim needs a structural assertion: walk the content container's DIRECT children and
require that the one carrying the divider also carries its row's label
(`renders the separator inside its cell rather than beside it`). Verified by putting the separator
back as a sibling and watching it fail.

# Float noise is not a layout change

`onLayout` does not reproduce a float bit-for-bit across relayouts: the cell positions derive from a
spacer height that is itself a float. Compared with `===`, every one of those re-reports counted as
a change — stored, spacer moves in its last bits, Fabric commits, Yoga relays out, next `onLayout`
starts the turn again. A loop at frame rate from a difference no screen can show.

Device-measured 2026-08-19: **1795 recomputes over one short drag**, 719 of them "changes", the log
solid with `27.33 -> 27.33 (-0.00)`. Second-order damage: `computeWindow`'s boundary test
(`offsets[i] + lengths[i] <= windowTop`) flapped across it, so the window's first index oscillated
`9 -> 8 -> 9` at a standing scroll offset and a cell was created and destroyed every other frame.

`isSettledLayout` / `LAYOUT_EPSILON = 0.01` in `virtualized-list.ts` guards both `measure` and the
viewport `layout` action. The smallest real change a host can express is one device pixel — a third
of a point at @3x — so 0.01 is ~30x under any real move and ~1e11 over the noise. **Bail without
storing:** keeping the settled value byte-identical is the half that matters, since the spacer
derived from it then stops moving too.

# A separator is gated on the DATA's last index, never the window's

RN: `const end = getItemCount(data) - 1` … `ItemSeparatorComponent={ii < end ? … : undefined}`
(`VirtualizedList.js:793`). Every adapter here gated on the WINDOW's `last` instead.

Harmless while the separator was a sibling — it only changed sibling count off-screen. The moment it
moved INSIDE the measuring wrapper (previous section) it became load-bearing: a cell's own measured
height then changed as the window slid past it. Device-measured as a run of consecutive cells all
shifting by exactly the divider's 1px.

There was a SECOND window-dependent term in the same predicate, found only after the first was
fixed: Solid and Svelte also excluded the force-mounted sticky cell
(`index !== plan.forcedStickyCell?.index`). As the window slides that index moves — the old sticky
cell regains its separator, the new one loses it, everything below shifts 1px. RN excludes neither.

**The lesson is the pair, and it generalises: moving a node inside a measured box makes EVERY
predicate that decides whether to render it part of the geometry.** Re-read all of them whenever the
box changes. `hasSeparatorAfter` may now mention nothing but the item's own index and the data's
length.

None of this was caught by a test — the suite stayed green through all three rounds. Placement and
gating are structural claims and need structural assertions: walk the content container's DIRECT
children and ask what each one CONTAINS.

All five adapters now carry the same three (React/Angular in a `virtualized-list-separator.test.*`,
Vue and Svelte appended to their existing list suites, Solid inside its own):

- `renders the separator inside its cell rather than beside it` — every direct child holding a
  divider must also hold its row's label; a sibling shows up as a child with a divider and no label.
- `keeps the separator on the window-last cell, which is mid-data` — THE discriminator between the
  two gates, since a window gate drops exactly that cell.
- `withholds the separator from the last item of the DATA` — the other half of the gate.

Solid additionally pins `gives the force-mounted sticky cell a separator like any other cell`.

Each was broken twice on purpose — separator back to a sibling, then gate back to the window — and
the failures recorded. Two config notes that cost time: `windowSize: 1` zeroes the overscan, so a
two-row list windows down to cell 0 alone and the cell under test never commits (the gate test needs
the default window); and a test that only checks the DATA-last cell passes under both gates, which
is why the window-last assertion has to exist separately.

# The on-screen readout must not be able to change its own height

An overlay rendered inside the layout it measures is part of that layout. `ListDiagnostics` sat
above the list in the same flex column, so any change to its height changed the list's viewport,
which shifted everything below it.

The row COUNT was already fixed for exactly this reason — and it was not enough. A single row
**wrapped** onto a second line when its text grew, and the text grew precisely at a window
transition, because that is when the long values appear (`d+1.00`, `Δ+59.00` instead of `d0.00`,
`Δ0.00`). So the readout jumped at the exact moment the list was under suspicion, and the
instrument's artifact was indistinguishable from the bug being hunted. Three rounds of
"still jitters" were spent on it.

Two independent guards, both required: `numberOfLines={1}` on every row so wrapping is impossible,
and fixed-WIDTH formatting (`padStart`) on every value including integer indices (`f8` -> `f10` is
another character) so the line does not reflow in the first place.

**The tell was there and was misread: `moved 0`, `RESID 0.00`, no dropped frames, and a visible
jump.** When every instrument says the system is stable and the eye disagrees, suspect the
instrument before adding another one. The five geometry bugs above were real and are proven by
headless tests; this last round was not a sixth bug.
