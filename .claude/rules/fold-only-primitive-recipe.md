---
paths:
  - 'core/components/src/behaviors/**'
  - 'core/components/src/view/render-*'
  - 'core/components/host-primitives.cjs'
---

# Bringing a FOLD-ONLY primitive to the lowered path — the recipe, established on Image

A fold-only primitive is one whose wrapper body is prop mapping and nothing else: no state, no
imperative handle, no listener it owns. Of the eight primitives still outside `HOST_PRIMITIVES`,
four are this shape — Image, ActivityIndicator, SafeAreaView, InputAccessoryView. Image was done
first to establish the steps; the other three should be mechanical.

The order is the point. **Wire and prove the runtime half FIRST; add the `HOST_PRIMITIVES` key
LAST, in the same commit as its fixture row.** The key is what makes every transform start lowering
that primitive at once, and a missing fold does not fail — it sends a key no ViewConfig declares to
Fabric, which throws nothing, logs nothing and paints nothing.

## 0. FIRST check the render fn SYNTHESIZES no node — most of the batch does not

The cheapest disqualifier, and it comes before counting implementations. A payload fold maps props
to props on ONE node; it cannot create a node. **The test is not "returns a tree"** — that
over-rejects, and it was the first phrasing:

```
Image                el('symbiote-image', mapped)                      one node          fold-only
InputAccessoryView   el('symbiote-input-accessory-view', mapped, [])   one node          fold-only
SafeAreaView         adapters build one element each, no shared fn     one node          fold-only
Modal                el('symbiote-modal', props, children)             children are the APP'S — fine
ActivityIndicator    el('symbiote-view', w, [el('symbiote-activity…')]) SYNTHESIZES a node  NOT
```

Passing the app's children through is not a disqualification; MANUFACTURING a container is. Phrase
it the first way and the recipe rejects `Modal` and every future primitive that takes children.

Measured 2026-09-01, after `ActivityIndicator` was nominated as the second fold-only case. It is not
one: `renderActivityIndicator` returns a centering `symbiote-view` wrapping the spinner, so a single
lowered tag would drop the container and change layout — an optimisation that moves the observable
surface, which this project treats as a bug.

**And check upstream before concluding our wrapper over-builds**, the way `android_ripple` turned
out. Here it does not: RN's own `ActivityIndicator.js:112` renders
`<View style={StyleSheet.compose(styles.container, style)}>` around the native spinner, so the two
nodes are inherent rather than ours to remove.

Lowering a composition would need a behavior that CREATES a child — new engine surface, and a
child-creating behavior is a machine, which fails check (2) below anyway. Treat "the render fn
returns a tree" as "not in this batch", not as "needs a bigger fold".

### And a per-platform view NAME does not imply a platform-invariant fold — on ActivityIndicator both differ

**This was assumed the other way and the assumption was wrong**, which is why the step says check
rather than merely stating the answer: the sentence this section was asked to record was
"per-platform view name, platform-invariant fold". It is false here, and the second half is the part
that matters:

```
ios      ActivityIndicatorView   defaultColor '#999999'  nativeExtras {}
android  AndroidProgressBar      defaultColor null       nativeExtras { styleAttr: 'Normal', indeterminate: true }
```

Android's two extras are not cosmetic — without `styleAttr` the view throws `setStyle() not called`
— and a null default color exists so the prop can be OMITTED rather than sent as null, which
Fabric's color parser rejects. So a fold for this primitive would have to be platform-split, on top
of being unable to build the tree. Ask the question per primitive; the name split answers nothing.

## 1. Find the fold, and expect more than one implementation of it

`tests/lowered-primitive-fold-parity.test.ts` diffs each wrapper's shared-layer VALUE imports
against the behavior's, which finds a fold that is CALLED by name. It cannot see a fold written
inline, and on Image there were three implementations before this work:

```
react vue solid   call renderImage()                         the shared one
svelte            adapters/svelte/src/components/image/image-logic.ts reproduces the mapping BY HAND
                  — its own header says it had to, because nothing was exported to call
angular           folds in an Angular template (components/image/index.ios.ts)
```

So step one is not "read the wrapper", it is **"read every wrapper and count the implementations"**.
Extracting the fold for the behavior is what collapses them, and that is most of the value.

## 2. Split the render fn into `map<X>Props` + `render<X>`

`renderImage` was `(view) => el(tag, mapped)`. It is now:

```ts
export function mapImageProps(view: IImageViewProps): Record<string, unknown> { … }
export function renderImage(view: IImageViewProps): IDescriptor {
  return el('symbiote-image', mapImageProps(view));
}
```

Pure refactor, no behaviour change. Also export the list of prop names the fold CONSUMES
(`IMAGE_VIEW_PROP_NAMES`) — an adapter that splits props before calling the render fn was copying
that list by hand, so a name added to one reached the other only if somebody remembered.

## 3. The behavior narrows, it does not re-fold

`core/components/src/behaviors/image.ts` holds no mapping. It converts a flat `Record<string,
unknown>` into the typed view and calls `mapImageProps` — the `stringOf` / `booleanOf` guard idiom
`behaviors/text-input.ts` already uses, never a cast. `attach` and `detach` are required by
`IHostBehavior` and are deliberately empty; write them out rather than sharing a `noop`, so the
emptiness reads as a decision.

## 4. THE TAG QUESTION, and it has two answers — decide it with a test, not a precedent

A behavior's fold is keyed on the tag, and `fabricProps` warns why that matters: a wrapper and its
lowered twin share the component name, so a fold registered on a tag the wrapper also emits runs on
ALREADY-FOLDED props. TextInput answered this with a `-managed` tag for the wrapper. Image does not
need one — and the two questions that decide it are separate:

```
1. is the fold idempotent?              no  -> the wrapper needs its own `-managed` tag
2. does the behavior carry a MACHINE?   yes -> it needs one anyway, idempotent or not
```

**Do not infer (1) from TextInput's split; its answer is (2).** Measured 2026-09-01 by reaching
`node.payloadFold` off a real `symbiote-text-input` node and running it twice: TextInput's fold IS
idempotent — it deletes its alias-only keys and derives the rest. Its split exists because the
behavior owns `change`/`focus`/`blur` and carries `attach` / `attachAfterCommit` / `afterCommit`,
so sharing the tag would attach a live machine to a node whose wrapper is already running one.
Solid's `register.ts` states the rule: one owner per node.

Image's mapping is idempotent by construction — every alias it consumes (`src`, `srcSet`, `alt`,
`width`, `height`) is absent from its own output, `source` comes back in the array shape
`normalizeSource` guarantees, and `loadingIndicatorSource` leaves under a DIFFERENT name
(`loadingIndicatorSrc`), so a second pass finds nothing to fold.

**Assert it; do not reason it.** `behaviors/image.test.ts` pins `fold(fold(x)) === fold(x)` for both
the W3C-alias and the legacy-source shapes, and the assertion was break-tested (making `sourceOf`
re-wrap an array reddens exactly those two rows). The audit rule's point is that a double fold is
invisible *precisely when* it happens to be harmless — so the property has to be pinned or it is an
accident waiting for the next edit. Prefer the same tag when the test passes: it avoids a rename
across ~50 call sites and keeps ONE fold implementation for both paths.

## 5. Register it — and note who registers

`adapters/{angular,solid,svelte,vue}/src/register.ts`, one call each. **React registers nothing** and
does not need to: it folds in its host config via `foldHostBag`. A new fold-only primitive therefore
touches four files, not five, and a recipe that says "every adapter" is wrong.

## 6. Prove it before the key exists

Two claims, both assertable with no spec entry and no transform involvement:

- the LOWERED path (flat bag through the behavior) produces the payload the WRAPPER path produces,
  compared as sorted key set AND values — not per-key assertions;
- every consumed alias is ABSENT from the output. A raw `src` reaching Fabric is the silent failure
  this whole exercise exists to prevent, so assert the absence, not only the presence of `source`.

## 7. The fixture row belongs with the KEY, not before it

Adding a row to `core/components/lowering-fixtures.cjs` immediately reddens all five runners —
each asserts `SNIPPETS[testCase.id]` exists, with the message "the shared table gained X and <Y> has
not declared a snippet for it". That is the mechanism working, but while the entry is withheld the
row buys ZERO coverage: no transform can lower a primitive the spec does not carry, so the row can
only report the absence.

So stage the control in the adapter's own runner instead, self-expiring:

```ts
expect(HOST_PRIMITIVES.Image, 'entry now exists — move the row into lowering-fixtures.cjs …')
  .toBeUndefined();
expect(() => loweredMarkersFor('Image')).toThrow(/no HOST_PRIMITIVES entry for Image/);
```

The first assertion fails the day the key lands and its message says what to do. The second is the
control the shared row will need — it distinguishes "the transform refused" from "the primitive is
absent", which are the same green otherwise (`adapter-parity-audit.md` records both
`intrinsic-choice-*` rows passing with the detection never invoked).

## What Image did NOT need, and why the next three probably will not either

No `ownedListeners` (it owns no event), no `attachAfterCommit` (nothing needs a Fabric tag at
setup), no `afterCommit` (no prop-driven handshake), no `-managed` tag. If a candidate needs any of
those, it is not fold-only and this recipe is the wrong one — ScrollView, Modal, Switch and
RefreshControl are the four that carry state or a handle.

## PARKED: what to do about a primitive whose native view is inherently wrapped

`ActivityIndicator` is the first, and the decision is an architecture call rather than a build task.
RN itself wraps the spinner in a centering `<View>` (`ActivityIndicator.js:112`), so the second node
is inherent and cannot be dropped without moving layout. Three options, with what each costs:

**A. Leave it a permanent component.** Cost: zero engineering, and the primitive never lowers — one
Solid/Vue/Svelte component instance per spinner forever. Cheap because spinners are rare: a screen
has one or two, not a thousand, so the instance cost this initiative exists to remove is not being
paid here in any measurable quantity. The honest objection is uniformity, not performance.

**B. Two-tag lowering.** The transform emits the container tag and the behavior synthesizes the
spinner child. Cost: a new engine capability — a behavior that CREATES a node — plus a new tag for
the container (`symbiote-view` is shared, so the registry could not key on it). It also fails this
recipe's own check (2): a child-creating behavior needs the child's props kept in step, which is a
commit hook, which is a machine, which is what forces a `-managed` split. So option B is not a
fold-only primitive at all; it is a new category with its own split to design.

**C. Synthesize the container in the engine's commit walk**, the way `RCTVirtualText` is resolved
(`viewNameFor` in `core/engine/src/commit.ts` re-creates a node when its kind flips). Cost: the walk
gains a per-primitive structural rule, which is the thing the walk has so far avoided — today it
decides a NAME, never a shape. The precedent is real but narrower than it looks: `RCTVirtualText`
changes what one node IS, it does not add a node. Adding one means the retained tree and the
committed tree stop agreeing on node count, which every counter, census probe and benchmark in this
repo currently assumes.

Recommendation, for whoever decides: **A**, until a screen exists where spinner instances are
measurable. B and C both buy a lowering nobody has shown is worth anything, and C pays for it in the
one place the project has kept simple.

## Landing a key EXPIRES every test that named that primitive as "not lowered"

Third instance on 2026-09-01, and the first two were each repaired by swapping in another name,
which is what guarantees a fourth. `adapters/vue/metro-vue-transformer.test.ts` asserts that listing
in `HOST_PRIMITIVES` is what makes a tag lowerable — and demonstrated it with a primitive that was
absent. `Pressable` stood there until 2026-08-23, `Image` until the entry landed an hour before this
was written.

The failure reads as a lowering regression in the thing under test, which is the expensive part: the
message is `expected … to contain '_unref(Image)'`, so the reader's first hypothesis is that the
transform broke, not that the world moved. Two sessions independently spent a round on it.

**Derive the subject from the spec instead of naming it**, the same move `adapterNames()` makes for
adapter lists:

```ts
const absent = candidates.filter(name => HOST_PRIMITIVES[name] === undefined);
expect(absent.length, `every candidate is now lowerable (…) — pick one still absent, or retire this case`)
  .toBeGreaterThan(0);
const subject = absent[0];
```

A derived subject cannot go stale: the day a candidate is added it stops being chosen, and when the
list empties the test says so rather than quietly asserting nothing. So the checklist item for
landing a key is not "fix the tests that broke" but **"grep for the primitive's name in tests that
assert absence, and make each one derive"** — otherwise the same round is paid again at the next key.
