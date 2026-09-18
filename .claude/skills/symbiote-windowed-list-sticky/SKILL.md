---
name: symbiote-windowed-list-sticky
description: "How a WINDOWED list pins sticky headers in SymbioteNative — read BEFORE touching sticky headers in any adapter's VirtualizedList / FlatList / SectionList, before forwarding `stickyHeaderIndices` to a scroll view, and before writing or re-aiming a test that locates a sticky cell. The rule: a windowed list names the `sticky-header` TAG on the cell and forwards NO indices. `stickyHeaderIndices` numbers the scroll view's PAINT children, which move every time the window slides, so the behavior re-wraps a different child each pass — wrappers accumulate a whole section per slide, the wrapped cell's `onLayout` starts reporting y relative to the wrapper, and the list's offset table is poisoned. Device-confirmed on Vue and Angular, 2026-09-18. Covers: why the index form cannot survive windowing, the per-adapter shape of the tag form (Vue `h()`, Angular `IWindowCell.isSticky` + `@if/@else` in BOTH axis copies of the template), the park/return precondition that `reattachOne` does not re-emit `recordSetTag`, and why a test for this needs a TWO-SIDED oracle — 'a sticky-header tag was committed' goes green while the broken index form is still running, because its synthesized wrappers carry that very tag. Trigger on: sticky header stops pinning mid-list after fast scrolling, a header that pins for half a section then stops, cells measuring `offset=0`, a wrapper whose height grows by a section per scroll, `stickyHeaderIndices` in any list adapter, or `plan.stickyChildPositions`."
---

# A windowed list pins by TAG, never by index

```
stickySet?.has(cell.index) === true ? 'sticky-header' : 'view'
```

That is the whole fix. The cell IS the header — same position, same key, same `onLayout` (the
behavior forwards it rather than replacing it). The collision point then comes from the owner's
DOCUMENT order, which is the one form that survives windowing.

`scrollProps.stickyHeaderIndices` is **not forwarded**, and `plan.stickyChildPositions` is
deliberately **not read** — it was the input to the index form and nothing else.

## Why the index form cannot work here

`stickyHeaderIndices` numbers the scroll view's PAINT children, and the behavior synthesizes a
wrapper around child N (`wrapForIndex`). A windowed list paints a header, a spacer and a slice, so
those positions move every time the window slides — and the reconciler re-wraps a *different* child
on each pass.

Device-diagnosed 2026-09-18 on `examples/angular` and `examples/vue`, sticky path B. Three symptoms,
all measured in one log:

```
a wrapper's height grew   988 -> 1976 -> 2964     one WHOLE SECTION swallowed per slide
the wrapped cell's own onLayout   cell 136 measured length=28 offset=0
                                                  y is now relative to the WRAPPER
nextHeaderLayoutY                 wandered
```

Visible symptom: the header pins for half a section, then stops, permanently — and stays dead for
every section after it.

**React, Svelte and Solid never had it**, and that is what located the bug rather than any reading of
the sticky rule itself. Their lists already named the tag. Angular and Vue were the only two left on
the index form, and they are exactly the two that broke. *When a bug hits a strict subset of the
adapters, diff the adapters before diffing the engine.*

Not caused by the C++ sticky port — the same failure is recorded at
`adapters/*/components/virtualized-list/index.ts` from an earlier incident.

## Per-adapter shape

**Vue** — `pushCell` picks the tag in the `h()` call. One line.

**Angular** — the template cannot compute a tag inline, so `IWindowCell` carries the decision:

```ts
/**
 * Picks the cell's TAG in the template — `sticky-header` pins, `view` does not.
 *
 * It is stable per cell key (an index is a section header or it is not), so the `@if` never
 * swaps an element type under a live cell and nothing remounts as the window slides.
 */
isSticky: boolean;
```

`buildWindowCell(index, key, includeSeparator, isSticky)`; the forced cell passes `true` (sticky by
construction — `forcedStickyCell` exists only for an index in `stickySet`).

**BOTH axis copies of the template must change.** The vertical and horizontal branches are separate
literals; a `replace_all` edit is correct here and a single-site edit silently leaves one axis on the
old form. The forced block's `<view>` becomes `<sticky-header>`, and the `@for` body becomes
`@if (cell.isSticky) { <sticky-header …> } @else { <view …> }`.

Angular's `anchor-host-registry` lists `'sticky-header'`, but the renderer gate is
`COMPONENT_DESCRIPTORS[engineName] === undefined && isAnchorHostComponent(engineName)` — and
`sticky-header` IS a descriptor, so the anchor branch never fires for it. Do not chase that path.

## The precondition the C++ port introduced

`recordSetTag` is emitted by `attachHostBehavior` and by nothing else. `reattachOne` restores
`attach` / `attachAfterCommit` and does **not** re-emit the tag — its comment assumes "a parked node
usually returns with its tag intact".

A windowed list parks and returns headers continuously, so that assumption is load-bearing here and
was asserted nowhere. It is now:
`core/engine/cpp/tests/js/sticky-header-payload.itest.ts`, "keeps its tag rule after the window parks
it and brings it back". If the tag does not survive, the header loses `zIndex`, `collapsable: false`
and its transform at once — and a header Yoga is free to flatten has no view left to pin.

That case needs a value the FIRST commit never saw (`setProp(node, 'stickyTranslateY', 42)` between
the removal and the re-append), or it is green whether or not the rule ran again: the payload left
standing from the first commit satisfies every assertion.

## The test needs a TWO-SIDED oracle

```ts
expect(fabric.findAll(one => one.tagName === 'sticky-header').length).toBeGreaterThan(0);
expect(findScrollView().props.stickyHeaderIndices).toBe(undefined);
```

Each half alone is vacuous:

- **"a sticky-header tag was committed"** goes green while the index form is ALSO running — its
  synthesized wrappers carry that very tag. Measured, not assumed: this assertion passed *before* the
  fix on both adapters.
- **"no indices reached the scroll view"** goes green on a list that dropped sticky support entirely.

## Locating a cell in a test

`tagName` — what the host was TOLD — is the durable locator. Reading `payload.zIndex === 10` or
`payload.collapsable === false` is reading the RULE's output, and a locator made of the thing under
test expires with it (that is what broke fourteen cases when the fold moved to C++).

**`tagName` is `''`, not `'view'`, for a node no behavior attached to.** The host records a tag only
via `attachHostBehavior`, and a plain view registers none. So "this cell does not pin" is asserted as
`toBe('')`.

The old Angular witness was `expect(forcedDepth).toBe(windowedDepth + 1)` — it pinned the synthesized
wrapper, i.e. the mechanism being removed, so it went red on the fix as predicted. Re-aimed onto a
direct tag witness (`cellTagFor`), not deleted: the claim ("the forced branch pins too") was always
correct and was merely being asserted through a side effect.
