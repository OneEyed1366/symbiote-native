// The ScrollView structure behavior — the first consumer of `buildStructure` / `childHost`.
//
// WHAT THIS PROVES: the engine builds the same two-node shape every adapter's ScrollView wrapper
// builds today, from the tag alone, with no component instance anywhere — AND composes the same
// two style arrays onto it. The style half is the part that fails silently: both nodes get a
// style either way, and only the PRECEDENCE says whether the app's value or the axis constant
// won. The two orders are opposite on purpose (base under on the owner, row over on the slot), so
// a test that checked only one would pass with both folds written the same way.
//
// Registration happens HERE and nowhere else — see the behavior's header for why it waited on the
// engine becoming the single owner of the content node.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '../../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  insertBefore,
  removeChild,
  registerRules,
  routeProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  childrenOf,
  propOf,
  propsOf,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { selectScrollIntrinsics } from '../../view/render-scroll-view';
import {
  HORIZONTAL_SCROLL_VIEW_TAG,
  registerScrollViewBehavior,
  SCROLL_VIEW_TAG,
} from './index';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// The slot's props, asked of the host — JS holds no tree, and every call site here has already
// established that the slot exists.
function slotPropsOf(owner: ISymbioteNode): Readonly<Record<string, unknown>> {
  const slot = owner.childHost;
  if (slot === undefined) throw new Error('the owner built no slot');
  return propsOf(slot);
}
let nextRootTag = 9700;

function scrollNode(tag: string): ISymbioteNode {
  return createElement(descriptorFor(tag).component, false, tag);
}

beforeEach(() => {
  registerScrollViewBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  fabric.reset();
});

describe('the structure the behavior builds', () => {
  // Derived from `selectScrollIntrinsics`, never hardcoded: it is the ONE function every adapter's
  // wrapper calls, so deriving is what makes this a comparison rather than a restatement. It also
  // keeps the test honest across platforms — the vertical content intrinsic resolves to
  // RCTScrollContentView on iOS and to a plain RCTView on Android.
  it.each([
    { name: 'vertical', tag: SCROLL_VIEW_TAG, horizontal: false },
    { name: 'horizontal', tag: HORIZONTAL_SCROLL_VIEW_TAG, horizontal: true },
  ])(
    '$name: builds the content node the wrapper would',
    ({ tag, horizontal }) => {
      const { scrollViewIntrinsic, contentIntrinsic } = selectScrollIntrinsics(
        horizontal,
        undefined,
      );
      expect(tag).toBe(scrollViewIntrinsic);

      const owner = scrollNode(tag);

      expect(childrenOf(owner)).toHaveLength(1);
      expect(owner.childHost).toBe(childrenOf(owner)[0]);
      expect(owner.childHost?.component).toBe(
        descriptorFor(contentIntrinsic).component,
      );
    },
  );

  it('gives the horizontal content node the row direction the wrapper does', () => {
    const { contentStyle } = selectScrollIntrinsics(true, undefined);
    // The wrapper's contentStyle for horizontal is `[contentContainerStyle, {flexDirection:'row'}]`;
    // with no contentContainerStyle the only live half is the row direction, which is a constant of
    // the TAG and so is the only half a structure-time build can supply.
    expect(contentStyle).toEqual([undefined, { flexDirection: 'row' }]);

    // Structure time carries NOTHING now; the row direction is a rule, and so is the `collapsable`
    // this used to expect here (see the case below).
    const owner = scrollNode(HORIZONTAL_SCROLL_VIEW_TAG);
    expect(slotPropsOf(owner)).toEqual({});
  });

  // why: the builder seeds NO props onto the content node, on either axis — which is what makes the
  // tag rule the single source of everything that node sends. It used to seed `collapsable: false`
  // with a `setProp`; that is `foldScrollContentProps` since 2026-09-18, because it is unconditional
  // on both axes (`ScrollView.js:1747`) and therefore a constant of the tag rather than of a builder.
  //
  // WHAT IT SENDS is asserted where a rule's output is visible at all —
  // `core/engine/cpp/tests/js/scroll-content-payload.itest.ts`, "from the rule and not a seed". This
  // harness builds payloads through the TypeScript `fabricProps`, which carries no copy of the tag
  // rules, so a `collapsable` assertion here could only ever have been about the seed.
  it('seeds nothing onto the content node, both axes', () => {
    expect(slotPropsOf(scrollNode(SCROLL_VIEW_TAG))).toEqual({});
    expect(slotPropsOf(scrollNode(HORIZONTAL_SCROLL_VIEW_TAG))).toEqual({});
  });
});

describe('app children reach Fabric under the content node', () => {
  it('commits RCTScrollView > content > children', () => {
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    surface.appendChild(root);

    const owner = scrollNode(SCROLL_VIEW_TAG);
    const child = createElement('RCTImageView');
    // The adapter appends to the OWNER and never learns a slot exists — the whole point of the
    // redirect. Nothing in this test names `childHost` on the write path.
    appendChild(owner, child);
    appendChild(root, owner);
    surface.commit();

    // `owner`'s own handle, not a search — the file already holds it.
    const contentName = descriptorFor('scroll-content').component;
    expect(live.serialize(owner)).toBe(
      `RCTScrollView(${contentName}(RCTImageView))`,
    );
  });
});

describe('owner props that belong to the slot', () => {
  it('routes contentContainerStyle onto the content node, not the owner', () => {
    const owner = scrollNode(SCROLL_VIEW_TAG);
    // Written on the OWNER, which is where the app writes it and therefore where every adapter
    // writes it. Nothing on this line knows a slot exists.
    routeProp(owner, 'contentContainerStyle', { padding: 12 });

    expect(propOf(owner, 'contentContainerStyle')).toBeUndefined();
    expect(propOf(owner, 'style')).toBeUndefined();
    expect(slotPropsOf(owner).style).toEqual([undefined, { padding: 12 }]);
  });

  // Device-found 2026-09-08: every canary writes `contentContainerStyle="scroll-content"`, a class
  // NAME. Renamed verbatim onto the slot it becomes a `style` holding a string — not a style, so
  // the whole rule (here the padding AND the gap) vanished with nothing red. React never showed it
  // because its wrapper calls resolveClassName itself before the engine sees the prop.
  it('resolves a class-NAME contentContainerStyle through the registry', () => {
    registerRules([
      {
        tokens: ['scroll-content'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 24, gap: 20 },
      },
    ]);
    const owner = scrollNode(SCROLL_VIEW_TAG);
    routeProp(owner, 'contentContainerStyle', 'scroll-content');

    expect(slotPropsOf(owner).style).toEqual([
      { padding: 24, gap: 20 },
      undefined,
    ]);
    // The owner keeps its own class slot free: the name belongs to the content view.
    expect(propOf(owner, 'style')).toBeUndefined();
  });

  it('leaves the owner its own style', () => {
    const owner = scrollNode(SCROLL_VIEW_TAG);
    routeProp(owner, 'style', { backgroundColor: 'red' });

    expect(propOf(owner, 'style')).toEqual([
      undefined,
      { backgroundColor: 'red' },
    ]);
    expect(slotPropsOf(owner).style).toBeUndefined();
  });
});

describe('style precedence, which is opposite on the two nodes', () => {
  function commitScroll(
    tag: string,
    props: Readonly<Record<string, unknown>>,
  ): { owner: ILiveNode; slot: ILiveNode } {
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    surface.appendChild(root);
    const node = scrollNode(tag);
    for (const key of Object.keys(props)) routeProp(node, key, props[key]);
    appendChild(root, node);
    surface.commit();

    // `node`'s own handle, not a search — the file already holds it.
    const owner = live.nodeOf(node);
    const slot = owner.children[0];
    if (slot === undefined) throw new Error('content node never committed');
    return { owner, slot };
  }

  // BOTH HALVES OF THIS PAIR HAVE NOW LEFT — the owner's base style on 2026-09-18 and the slot's row
  // constant the same day, once `fabricProps` gained `ownerProps` and the content rule could move
  // too (`core/engine/cpp/tests/js/scroll-content-payload.itest.ts`). This host builds its payload
  // through the TypeScript `fabricProps`, which carries no copy of the tag rules.
  //
  // What survives here is the ROUTING, which is the half that was always this file's: an app writes
  // `contentContainerStyle` on the OWNER and it has to arrive on the SLOT, which no rule does — the
  // behavior's `slotProps` redirect does, in JS, before any payload exists.
  it('routes contentContainerStyle onto the slot', () => {
    const { slot } = commitScroll(HORIZONTAL_SCROLL_VIEW_TAG, {
      style: { flexGrow: 9, backgroundColor: 'red' },
      contentContainerStyle: { padding: 12, flexDirection: 'column' },
    });

    expect(slot.payload.padding).toBe(12);
  });

  it('vertical: the slot has no constant of its own', () => {
    const { slot } = commitScroll(SCROLL_VIEW_TAG, {
      style: { flexDirection: 'row' },
      contentContainerStyle: { padding: 4 },
    });

    expect(slot.payload.padding).toBe(4);
    // Nothing composes a direction onto a vertical content node — the wrapper's contentStyle for
    // vertical is `contentContainerStyle` alone.
    expect(slot.payload.flexDirection).toBeUndefined();
  });
});

// Mounts a scroll-view tag and hands back a re-commit, so a test can write a prop AFTER the
// first commit and read what the second one published. `node`'s own handle, not a search — the
// caller already holds it, so there is nothing to look up and no creation-log staleness to guard.
function mountScroll(
  tag: string,
  props: Readonly<Record<string, unknown>> = {},
): {
  node: ISymbioteNode;
  slot: ISymbioteNode;
  commit: () => { owner: ILiveNode; slot: ILiveNode };
} {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const node = scrollNode(tag);
  for (const key of Object.keys(props)) routeProp(node, key, props[key]);
  appendChild(root, node);

  const commit = (): { owner: ILiveNode; slot: ILiveNode } => {
    surface.commit();
    const owner = live.nodeOf(node);
    const slot = owner.children[0];
    if (slot === undefined)
      throw new Error('the scroll view never committed its two nodes');
    return { owner, slot };
  };

  const slot = node.childHost;
  if (slot === undefined) throw new Error('buildStructure produced no slot');
  return { node, slot, commit };
}

function layoutEvent(
  node: ISymbioteNode,
  width: number,
  height: number,
): ISymbioteEvent {
  return {
    type: 'layout',
    target: node,
    currentTarget: node,
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
    stopPropagation: () => {},
  };
}

describe('decelerationRate reaches Fabric as a number', () => {
  // RN's two WORDS resolve to different friction constants per platform, and that resolution left
  // this file with `resolveDecelerationRate` itself (2026-09-18): it is `foldScrollViewProps` in the
  // engine now, and this host builds its payload through the TypeScript `fabricProps`, which carries
  // no copy of the tag rules. Both words are asserted against the committed payload in
  // `core/engine/cpp/tests/js/scroll-view-payload.itest.ts`.
  //
  // The two cases below stay because neither depends on a rule this host cannot run: a NUMBER is
  // passed through by the same rule, and an absent rate must invent nothing. They would also both
  // pass with the rule deleted entirely — which is why the two WORD cases, the only ones that can
  // tell a working resolution from a missing one, moved rather than being left as the file's cover.
  it('passes a numeric rate through untouched', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG, { decelerationRate: 0.5 });
    expect(commit().owner.payload.decelerationRate).toBe(0.5);
  });

  it('invents no rate when the app set none', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG);
    expect(Object.hasOwn(commit().owner.payload, 'decelerationRate')).toBe(
      false,
    );
  });
});

// THE AXIS, THE BOUNCE PAIR AND `nestedScrollEnabled` ALL LEFT THIS FILE on 2026-09-18, four
// describes at once, and the grouping is the point rather than tidiness.
//
// All three are `foldScrollViewProps` in the engine now, and this host builds its payload through
// the TypeScript `fabricProps`, which carries no copy of the tag rules. Every one of them is
// asserted against the committed payload in `core/engine/cpp/tests/js/scroll-view-payload.itest.ts`,
// including the ignored-`horizontal` WARNING, which has no JS equivalent at all
// (`core/engine/cpp/tests/js/native-debug-log.itest.ts`).
//
// WHY ALL FOUR AND NOT JUST THE RED ONES. Each described pair had a deliberate control — "invents no
// key on the vertical tag", "honours an explicit false", "lets an explicit value win" — and every
// one of those controls went on PASSING after the port, because an absent key and an unmodified
// passthrough are exactly what a harness with no rule produces. Left behind they would have read as
// coverage of a rule this file can no longer reach, which is the false green this migration keeps
// meeting. A control is only a control beside the thing it controls.

describe('collapsableChildren is derived from props that stay on the owner', () => {
  it('writes no key when neither anchor prop is set', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG);
    expect(Object.hasOwn(commit().slot.payload, 'collapsableChildren')).toBe(
      false,
    );
  });

  // `collapsableChildren` ITSELF is the engine's rule now and unreachable from this host — it reads
  // the two props off the OWNER through `ownerProps`
  // (`core/engine/cpp/tests/js/scroll-content-payload.itest.ts`). Both names stay on the scroll view,
  // which is routing and is still this file's:
  it.each(['maintainVisibleContentPosition', 'snapToAlignment'])(
    '%s stays on the OWNER rather than travelling to the slot',
    key => {
      const { commit } = mountScroll(SCROLL_VIEW_TAG, {
        [key]: key === 'snapToAlignment' ? 'start' : { minIndexForVisible: 0 },
      });
      const { owner, slot } = commit();

      expect(owner.payload[key]).toBeDefined();
      expect(slot.payload[key]).toBeUndefined();
    },
  );

  // THE REASON `slotDerived` EXISTS, and it is now the more important half rather than the
  // incidental one. `markPropsDirty` bubbles UP, so an owner write reaches every ancestor and never
  // the slot, and `reconcile` skips a subtree whose root is clean — so without the declaration the
  // slot never re-commits and the rule, wherever it lives, never re-reads the owner.
  //
  // THE POSITIVE HALF IS ASSERTED IN THE ITEST, not here, and that is a real limit of this host
  // rather than a preference. The only observable a late owner write produces is the DERIVED value
  // on the slot's payload, which is the engine's rule now; re-publication itself is invisible, since
  // the engine node keeps its identity across commits and only its `committedProps` change. An
  // assertion on `.handle` was written here first and failed for exactly that reason.
  //
  // `core/engine/cpp/tests/js/scroll-content-payload.itest.ts` drives the whole path — commit, write
  // `snapToAlignment` on the owner, commit again, read `collapsableChildren` — which is stronger
  // evidence than any proxy available here. What stays below is the NEGATIVE half, whose observable
  // (nothing was republished) this host can still see.

  // The other half of the same guard: a re-render writing the SAME value must not dirty the slot,
  // or every ScrollView render clones its content node. `setProp`'s identity guard is what stops
  // it, which is why the mark is read past it and not in `routeProp`.
  // Asserted on node IDENTITY (the handle, not the live wrapper — `ILiveNode.children` is a getter
  // and two separate reads of the same node are never `===`): "the slot re-published nothing" is
  // read as "the same engine node came back", which is what a re-publish would have replaced.
  it('an unchanged rewrite publishes nothing', () => {
    const anchor = { minIndexForVisible: 0 };
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG, {
      maintainVisibleContentPosition: anchor,
    });
    const before = commit().slot;

    routeProp(node, 'maintainVisibleContentPosition', anchor);
    // The same OBJECT the host already holds: a re-published payload would be a different one.
    expect(commit().slot.handle).toBe(before.handle);
  });
});

describe('onContentSizeChange is synthesized from the content view layout', () => {
  it('wires nothing when the app passed no handler', () => {
    const { slot, commit } = mountScroll(SCROLL_VIEW_TAG);
    // `onLayout` is a GATED event: wiring it unconditionally would put the flag in every
    // ScrollView's payload and buy a native event nobody reads.
    expect(Object.hasOwn(commit().slot.payload, 'onLayout')).toBe(false);
    expect(slot.listeners?.get('layout')).toBeUndefined();
  });

  it('wires the slot layout and reports positional width/height', () => {
    const seen: Array<readonly [unknown, unknown]> = [];
    const { slot, commit } = mountScroll(SCROLL_VIEW_TAG, {
      onContentSizeChange: (width: unknown, height: unknown) => {
        seen.push([width, height]);
      },
    });
    // ONE commit. The wiring follows the LISTENER and is synchronous, so the gate flag is on the
    // slot before the first commit — the wrapper has no two-pass mount either.
    expect(commit().slot.payload.onLayout).toBe(true);

    const listener = slot.listeners?.get('layout');
    if (listener === undefined)
      throw new Error('no layout listener on the slot');

    listener(layoutEvent(slot, 320, 900));
    // RN's contract is positional, NOT a {width, height} object.
    expect(seen).toEqual([[320, 900]]);

    // Deduped exactly as RN dedupes: a layout pass that did not change the size is not a content
    // size change.
    listener(layoutEvent(slot, 320, 900));
    expect(seen).toHaveLength(1);

    listener(layoutEvent(slot, 320, 1200));
    expect(seen).toEqual([
      [320, 900],
      [320, 1200],
    ]);
  });

  it('unwires when the app drops the handler', () => {
    const { node, slot, commit } = mountScroll(SCROLL_VIEW_TAG, {
      onContentSizeChange: () => {},
    });
    expect(commit().slot.payload.onLayout).toBe(true);

    routeProp(node, 'onContentSizeChange', undefined);
    // ABSENT, not null. Fabric has no prop removal — the engine's op stream spells "clear" with
    // NO_VALUE, and a host replaying that op deletes the key; `null` was only ever the old mirror's
    // clone-protocol spelling (mirror-elimination.md, "RESOLVED: the onLayout === null decision").
    expect(Object.hasOwn(commit().slot.payload, 'onLayout')).toBe(false);
    // …and the record lost it too, proving a clearing op was sent rather than merely stopped.
    // `slot` is the engine's own `childHost` handle, so there is nothing to search for.
    expect(
      Object.hasOwn(
        fabric.find(n => n.handle === slot)?.props ?? {},
        'onLayout',
      ),
    ).toBe(false);
    expect(slot.listeners?.get('layout')).toBeUndefined();
  });
});

describe('a RefreshControl child is claimed by the owner', () => {
  const REFRESH = descriptorFor('refresh-control').component;
  const CONTENT = descriptorFor('scroll-content').component;

  function refreshNode(): ISymbioteNode {
    return createElement(REFRESH, false, 'refresh-control');
  }

  // The app writes it among the children, because that is what a tag-only surface leaves it: the
  // prop carrying an element existed only because JSX had no way to MARK one.
  it('sits beside the content view, not inside it', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    appendChild(node, refreshNode());
    appendChild(node, createElement('RCTImageView'));

    // RN's iOS branch renders `{refreshControl}{contentContainer}`, in that order.
    expect(live.serialize(commit().owner.handle)).toBe(
      `RCTScrollView(${REFRESH}${CONTENT}(RCTImageView))`,
    );
  });

  // The control that says the claim is a claim and not "children stop being redirected". Without
  // it a broken `hostFor` that always returns the owner passes the case above.
  it('leaves an unclaimed child in the slot', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    appendChild(node, createElement('RCTImageView'));

    expect(live.serialize(commit().owner.handle)).toBe(
      `RCTScrollView(${CONTENT}(RCTImageView))`,
    );
  });

  // Source order is not delivery order: a framework may mount the rows first and the control on a
  // later pass. The position is the OWNER's rule, never the caller's.
  it('goes before the content view even when it arrives last', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    appendChild(node, createElement('RCTImageView'));
    appendChild(node, refreshNode());

    expect(live.serialize(commit().owner.handle)).toBe(
      `RCTScrollView(${REFRESH}${CONTENT}(RCTImageView))`,
    );
  });

  // `insertBefore` names a node the framework can see, and every row it can see lives in the SLOT
  // — so `indexOf` on the owner's own list misses and a naive fallback appends past the content.
  it('lands before the content view when the anchor is a row inside the slot', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    const row = createElement('RCTImageView');
    appendChild(node, row);
    insertBefore(node, refreshNode(), row);

    expect(live.serialize(commit().owner.handle)).toBe(
      `RCTScrollView(${REFRESH}${CONTENT}(RCTImageView))`,
    );
  });

  // The removal twin. The adapter names the owner, and the claimed child really is there — but a
  // `removeChild` that redirected to the slot would splice nothing and leave it committed forever.
  it('is removed from the owner the adapter named', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    const refresh = refreshNode();
    appendChild(node, refresh);
    appendChild(node, createElement('RCTImageView'));
    commit();

    removeChild(node, refresh);
    expect(live.serialize(commit().owner.handle)).toBe(
      `RCTScrollView(${CONTENT}(RCTImageView))`,
    );
  });
});
