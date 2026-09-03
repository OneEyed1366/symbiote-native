// ScrollView's host behavior — the first STRUCTURE-only behavior, and the pilot for
// `IHostBehavior.buildStructure` + `ISymbioteNode.childHost`.
//
// WHAT A COMPOSED PRIMITIVE COSTS TODAY. Every adapter's ScrollView wrapper builds the same two
// nodes: `selectScrollIntrinsics` picks a scroll intrinsic and a content intrinsic, and the
// wrapper's body nests `<content>{children}</content>` inside `<scroll>`. That body is a framework
// component instance per ScrollView — a Vue instance, a Solid props Proxy, Svelte anchors, an
// Angular LView — which is precisely the currency host-primitive lowering exists to delete
// (`.claude/rules/host-primitive-tier.md`). `foldPayload` gave a lowered primitive its wrapper's
// PROP MAPPING; nothing gave it the wrapper's COMPOSITION, so a composed primitive could not be
// lowered at all no matter what its props did. This is that half.
//
// WHY THE TAG CARRIES THE AXIS. `buildStructure` runs at `createElement`, before a single prop is
// routed, so it cannot read `horizontal`. It does not need to: horizontal scroll is already a
// SEPARATE intrinsic (`symbiote-horizontal-scroll-view` — a different native ViewManager on
// Android, not RCTScrollView with a flag), so the decision the behavior needs is in the tag it was
// looked up by. One behavior per tag, each knowing its own content intrinsic. That is the same
// shape `intrinsicWhen` gives TextInput's `multiline`, arrived at from the other side.
//
// NOT REGISTERED BY ANY ADAPTER, deliberately, and this is the whole reason the file is safe to
// land. `symbiote-scroll-view` is the tag the WRAPPERS already emit, and a wrapper builds its own
// content node from `selectScrollIntrinsics`. Registering here would give those trees a second
// content node — every existing ScrollView, silently double-nested. The precedent for the fix is
// `symbiote-text-input` vs `symbiote-text-input-managed` in `../component-names/shared.ts`: the
// wrapper and the lowered path get separate tags so exactly one owner builds each node. Splitting
// the scroll tags is the NEXT step and is not this one; until then `registerScrollViewBehavior()`
// is called only by tests, which is what exercises it.
//
// STYLE, on both nodes, and the precedence is the part that is easy to get silently wrong. The
// wrapper composes exactly two arrays, and this reproduces both:
//
//   owner    [scrollViewBaseStyle, style]                  base UNDER the app's, so an explicit
//                                                          flexDirection still wins
//   slot     [contentContainerStyle, {flexDirection:'row'}] row OVER the app's, on horizontal only
//
// Which is why the two halves use different seams rather than one. `contentContainerStyle` is
// written by the app on the OWNER and belongs to the slot, so it travels through `slotProps` — a
// pure RENAME (`contentContainerStyle` -> the slot's `style`) that goes through the slot's own
// `routeProp` and inherits style merging, class merging and the already-published guard. The
// CONSTANT half is a `payloadFold`, because a fold is where precedence can be expressed: the
// owner's puts the base first, the slot's puts the row direction last. A redirect that also tried
// to compose would have to pick one order for both.
//
// The slot's fold is assigned to the node inside `buildStructure`, not declared on the behavior:
// `IHostBehavior.foldPayload` is the OWNER's, wired by `attachHostBehavior`, and a behavior that
// builds a node owns what that node carries.
import {
  appendChild,
  createElement,
  registerHostBehavior,
  type IHostBehavior,
  type IPayloadFold,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import type { ISymbioteIntrinsic } from '../component-names/shared';
import {
  SCROLL_VIEW_BASE_HORIZONTAL,
  SCROLL_VIEW_BASE_VERTICAL,
} from '../view/render-scroll-view';

export const SCROLL_VIEW_TAG = 'symbiote-scroll-view';
export const HORIZONTAL_SCROLL_VIEW_TAG = 'symbiote-horizontal-scroll-view';

// The app writes it on the ScrollView; it styles the content view. One entry, and it is the whole
// reason `slotProps` exists.
const SLOT_PROPS: Readonly<Record<string, string>> = {
  contentContainerStyle: 'style',
};

// Composes a base style on one side or the other of whatever `style` the node already carries.
// `under` is the owner's order (an explicit value wins); `over` is the slot's (the row direction
// wins). Returns its input by identity when there is nothing to add, the contract IPayloadFold
// states and the folds beside this one keep.
function composeStyle(base: IViewStyle, under: boolean): IPayloadFold {
  return props => ({
    ...props,
    style: under ? [base, props.style] : [props.style, base],
  });
}

function buildContent(
  contentIntrinsic: ISymbioteIntrinsic,
  contentFold: IPayloadFold | undefined,
) {
  return (node: ISymbioteNode): ISymbioteNode => {
    const descriptor = descriptorFor(contentIntrinsic);
    const content = createElement(
      descriptor.component,
      descriptor.isText,
      contentIntrinsic,
    );
    // The wrapper sets it on every content node, both axes (react's `contentProps`). Yoga may
    // collapse a view that only groups children, and a collapsed content node takes the scroll
    // metrics with it.
    content.props = { collapsable: false };
    content.payloadFold = contentFold;
    // Lands directly on the owner, because `node.childHost` is still undefined here: the engine
    // assigns it from what this returns. That ordering is why `buildStructure` RETURNS the slot
    // instead of setting the field itself — a behavior that set it first would redirect its own
    // structure into the slot it was building.
    appendChild(node, content);
    return content;
  };
}

function scrollBehavior(
  contentIntrinsic: ISymbioteIntrinsic,
  base: IViewStyle,
  contentFold: IPayloadFold | undefined,
): IHostBehavior {
  return {
    slotProps: SLOT_PROPS,
    buildStructure: buildContent(contentIntrinsic, contentFold),
    foldPayload: composeStyle(base, true),
    // Structure and style only: there is no machine, no timer and no listener, so there is nothing
    // to take and nothing to release. Written as explicit no-ops rather than by widening
    // `attach`/`detach` to optional — a behavior that FORGOT its runtime and one that has none must
    // not be spelled the same way.
    attach() {},
    detach() {},
  };
}

export function registerScrollViewBehavior(): void {
  registerHostBehavior(
    SCROLL_VIEW_TAG,
    scrollBehavior(
      'symbiote-scroll-content',
      SCROLL_VIEW_BASE_VERTICAL,
      undefined,
    ),
  );
  registerHostBehavior(
    HORIZONTAL_SCROLL_VIEW_TAG,
    scrollBehavior(
      'symbiote-horizontal-scroll-content',
      SCROLL_VIEW_BASE_HORIZONTAL,
      // OVER the app's contentContainerStyle, matching the wrapper's
      // `[contentContainerStyle, {flexDirection:'row'}]`.
      composeStyle({ flexDirection: 'row' }, false),
    ),
  );
}
