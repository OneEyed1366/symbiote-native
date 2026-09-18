// The LAST production `payloadFold` in this codebase, and the contract it has to keep once it is a
// tag rule instead.
//
// WHAT THE FOLD DID (`behaviors/scroll-view/sticky.ts`, `stickyFold`): pinned `zIndex: 10` and a
// `transform: [{translateY}]` over the app's own style, and set `collapsable: false`. Three outputs,
// and splitting them by ORIGIN is the whole of why this can move:
//
//   zIndex: 10        a constant of the wrapper       RN: `styles.header` (`:318`)
//   collapsable       a constant of the wrapper       RN: a literal JSX prop (`:291`)
//   translateY        the DEBOUNCED settled value     RN: `passthroughAnimatedPropExplicitValues`
//
// Two of the three were never anything but the platform's. The third is live, but it is live at
// SETTLE rate rather than frame rate — the smooth pin rides the AnimatedProps leaf and never passes
// through here, while this one is what hit-testing reads, pushed once per debounce with a
// same-value guard in the reducer (`sticky-header-reducer.ts:297`).
//
// AND RN ITSELF SPELLS IT AS A PROP (`ScrollViewStickyHeader.js:282-304`), which is what decided the
// seam: no new opcode, no new host field. The machine writes `stickyTranslateY` like any other prop,
// the rule composes it into the style, and the key is stripped before Fabric — the same treatment
// `kPressableMachineKeys` gives the nine props Pressable's machine consumes. Ours narrows RN's name
// to the one number it ever carries, so it is not called `passthroughAnimatedPropExplicitValues`.
//
// WHY THE COMPOSITION IS OVER AND NOT UNDER. The pin is the entire point of the element: a header
// whose own style set a transform would otherwise cancel it. That inverts ActivityIndicator's rule,
// whose base goes UNDER so an app can still override the centring — the difference is whether the
// style is a default or a mechanism.

import { registerScrollViewBehavior } from '@symbiote-native/components';

import {
  appendChild,
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  removeChild,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

registerScrollViewBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

function commit(tag: string, props: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTView', false, tag);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

const header = (props: Record<string, unknown>): ICommitted =>
  commit('sticky-header', props);

function firstTransform(payload: Readonly<Record<string, unknown>>): unknown {
  const transform = payload.transform;
  return Array.isArray(transform) ? transform[0] : undefined;
}

describe('what a sticky header sends native', () => {
  // why: `styles.header = {zIndex: 10}` (`:318`) — a sticky header paints over the rows it scrolls
  // past. Without it the pin happens and is invisible, which is the failure mode hardest to spot in
  // a screenshot because the layout is correct.
  it('pins the header above its siblings', () => {
    expect(header({}).payload.zIndex).toBe(10);
  });

  // why: the pin goes OVER the app's style, unlike every other base style in this engine. A header
  // that set its own zIndex would otherwise fall back under the rows.
  it('keeps its own zIndex when the app asks for a lower one', () => {
    const payload = header({ style: { zIndex: 1, paddingLeft: 4 } }).payload;

    expect(payload.zIndex).toBe(10);
    // The app's other keys are untouched — this composes, it does not replace.
    expect(payload.paddingLeft).toBe(4);
  });

  // why: `collapsable={false}` (`:291`). Yoga may flatten a view that only groups children, and a
  // flattened header has no view left to carry a transform — so the pin silently stops happening on
  // exactly the headers that wrap nothing but their content.
  it('refuses to be flattened away', () => {
    expect(header({}).payload.collapsable).toBe(false);
  });

  // why: THE LIVE HALF. The debounced settled value is what Fabric commits for hit-testing, so a
  // pinned header that does not carry it is visually pinned and takes its touches at the old
  // position.
  it('commits the settled translate the machine handed it', () => {
    const payload = header({ stickyTranslateY: 42 }).payload;

    expect(firstTransform(payload)).toEqual({ translateY: 42 });
  });

  // why: the transform is the pin's, so it wins over the app's — the same reason as the zIndex, and
  // the one the fold's own comment gave for composing over.
  it('beats a transform the app wrote itself', () => {
    const payload = header({
      stickyTranslateY: 42,
      style: { transform: [{ translateY: 999 }] },
    }).payload;

    expect(firstTransform(payload)).toEqual({ translateY: 42 });
  });

  // why: THE TWO-SIDED HALF of the case above. `translateY` is null until the debounce first fires,
  // and a rule that invented a zero then would snap every header to the top of its scroller on
  // mount. The app's own transform is what survives instead.
  it('invents no transform before the machine has settled one', () => {
    const payload = header({
      style: { transform: [{ translateY: 7 }] },
    }).payload;

    expect(firstTransform(payload)).toEqual({ translateY: 7 });
  });

  // why: no ViewConfig declares `stickyTranslateY` — it is the machine's channel to the rule, not a
  // native prop. A leaked key reaches Fabric and is dropped in silence, which is what makes this
  // assertion the only place it would ever show.
  it('keeps the machine key out of the payload', () => {
    expect(header({ stickyTranslateY: 42 }).payload.stickyTranslateY).toBe(
      undefined,
    );
  });

  // why: THE CONTROL, and it is what makes every case above a claim about the TAG rather than about
  // the engine. A plain view with the same props gets none of it.
  it('does none of this to an ordinary view', () => {
    const payload = commit('view', { stickyTranslateY: 42 }).payload;

    expect(payload.zIndex).toBe(undefined);
    expect(payload.collapsable).toBe(undefined);
    expect(payload.transform).toBe(undefined);
  });

  // why: THE PRECONDITION THE PORT INTRODUCED, and nothing else in this file can see it. The fold
  // was assigned to the NODE in `attach`, so it ran for as long as the node lived; the rule fires
  // only if `recordSetTag` has delivered this tag to the host. `reattachOne` restores `attach` and
  // `attachAfterCommit` and does NOT re-emit the tag — its comment assumes "a parked node usually
  // returns with its tag intact", and that assumption is asserted nowhere.
  //
  // A windowed list parks and returns headers continuously, which is exactly the traffic this has
  // to survive. If the tag does not survive, the header loses `zIndex`, `collapsable: false` and
  // its transform at once — and a header Yoga is free to flatten has no view left to pin, so the
  // stickiness dies for that node and stays dead.
  it('keeps its tag rule after the window parks it and brings it back', () => {
    const surface = createSurface(ROOT_TAG);
    const root: ISymbioteNode = createElement('RCTView');
    const node: ISymbioteNode = createElement(
      'RCTView',
      false,
      'sticky-header',
    );
    appendChild(root, node);
    surface.appendChild(root);
    surface.commit();
    mounted();
    expect(committedPayloadOf(node)?.zIndex).toBe(10);

    removeChild(root, node);
    surface.commit();
    mounted();

    // A value the FIRST commit never saw, so the assertions below cannot be satisfied by the
    // payload left standing from it. Without this the case is green whether or not the rule ran
    // again — the same one-sided oracle the aria port had to correct.
    setProp(node, 'stickyTranslateY', 42);
    appendChild(root, node);
    surface.commit();
    mounted();

    const payload = committedPayloadOf(node);
    expect(payload?.zIndex).toBe(10);
    expect(payload?.collapsable).toBe(false);
    expect(firstTransform(payload ?? {})).toEqual({ translateY: 42 });
    expect(payload?.stickyTranslateY).toBe(undefined);
  });

  // why: THE COST, and the reason this port exists at all. A `payloadFold` marshals the whole bag
  // into JS and the whole bag back, per node per commit; the rule is a branch on a tag already in
  // the host. Zero is the claim — not "fewer".
  it('crosses into JS for none of it', () => {
    expect(header({ stickyTranslateY: 42 }).folds).toBe(0);
  });
});

report();
