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
// WHAT THIS DOES NOT DO YET, stated rather than left to be discovered on a device. The wrapper puts
// STYLE on both nodes — `scrollViewBaseStyle` on the scroll node, and `contentStyle`
// (`contentContainerStyle`, plus `flexDirection: 'row'` when horizontal) on the content node. The
// first is an owner prop and `foldPayload` can already express it. The second cannot be expressed
// by anything that exists: `contentContainerStyle` is written on the OWNER by the app and belongs
// on the SLOT, and there is no prop redirect to match the child redirect below. That seam —
// owner-prop -> slot-prop — is the next thing this pilot proves is needed, and the invariant half
// (`flexDirection: 'row'`) is applied here only because it is a constant of the tag, not a fold of
// a prop. A ScrollView is NOT lowerable until that seam exists; nothing here claims otherwise.
import {
  appendChild,
  createElement,
  registerHostBehavior,
  type IHostBehavior,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import type { ISymbioteIntrinsic } from '../component-names/shared';

export const SCROLL_VIEW_TAG = 'symbiote-scroll-view';
export const HORIZONTAL_SCROLL_VIEW_TAG = 'symbiote-horizontal-scroll-view';

// The invariant half of `selectScrollIntrinsics`'s `contentStyle`. The variable half is
// `contentContainerStyle` and is deliberately absent — see the header.
const HORIZONTAL_CONTENT_STYLE = { flexDirection: 'row' } as const;

function buildContent(
  contentIntrinsic: ISymbioteIntrinsic,
  style: Record<string, unknown> | undefined,
) {
  return (node: ISymbioteNode): ISymbioteNode => {
    const descriptor = descriptorFor(contentIntrinsic);
    const content = createElement(
      descriptor.component,
      descriptor.isText,
      contentIntrinsic,
    );
    if (style !== undefined) content.props = { ...style };
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
  contentStyle: Record<string, unknown> | undefined,
): IHostBehavior {
  return {
    buildStructure: buildContent(contentIntrinsic, contentStyle),
    // Structure-only: there is no machine, no timer and no listener, so there is nothing to take
    // and nothing to release. Written as explicit no-ops rather than by widening `attach`/`detach`
    // to optional — a behavior that FORGOT its runtime and one that has none must not be spelled
    // the same way.
    attach() {},
    detach() {},
  };
}

export function registerScrollViewBehavior(): void {
  registerHostBehavior(
    SCROLL_VIEW_TAG,
    scrollBehavior('symbiote-scroll-content', undefined),
  );
  registerHostBehavior(
    HORIZONTAL_SCROLL_VIEW_TAG,
    scrollBehavior('symbiote-horizontal-scroll-content', {
      ...HORIZONTAL_CONTENT_STYLE,
    }),
  );
}
