// `id` -> `nativeID`, which was spelled SEVEN times with THREE different coverage sets and is now
// spelled once.
//
// `id` is RN's W3C-named alias for `nativeID` and it WINS when both are set (`View.js:77-79`). A raw
// `id` is declared by no ViewConfig, so Fabric drops it in SILENCE — the rename is the only thing
// between an app and a lost nativeID, and a rename that half-works is invisible on device.
//
// WHERE IT USED TO LIVE, all seven at once:
//
//   foldHostBag        JS, on the way in, off `HOST_PRIMITIVES[*].aliases` — seventeen entries,
//                      every one the same pair. Reached by React, Svelte and Angular.
//   Vue's patchProp    its own, per key
//   Solid's renderer   its own, per key, PLUS a `WeakSet` of nodes whose nativeID came from an `id`
//   Angular's          its own `PROP_ALIASES` map, per key
//   foldIdAlias        C++, in the payload builder, for nodes with a NON-EMPTY tagName only
//
// THE OBVIOUS CLEANUP WAS THE WRONG ONE, which is worth keeping because it nearly happened.
// `foldIdAlias` had replaced five per-behavior JS folds, so `foldHostBag`'s `aliases` half looked
// like a leftover mirror — the shape this project deletes on sight. It was not one, and the reason
// is COVERAGE rather than content: `tagName` reaches the host only through `recordSetTag`, which
// `attachHostBehavior` emits, so a tag nobody registered a behavior for carries an empty tagName and
// no tag rule can fire. `view` and `text` are exactly that, and they are the two commonest elements
// in any app. The first version of this file measured that and it read the other way.
//
// SO THE SEAM IS `routeProp`, not a tag rule and not a bag fold. Every adapter's prop write ends
// there whatever shape it starts in, which is the one thing a bag fold and a per-key renderer share.
// A bag fold cannot serve Vue and Solid; a per-key fold cannot serve React's `applyProps`.
//
// The precedence block below is why it needs per-node state at all, and it is the memory Solid had
// already built alone.

import { registerButtonBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

// One registered behavior, so `hasHostBehaviors()` is true and the tag path is live at all — with
// none registered `createElement` skips `attachHostBehavior` wholesale and every tag would read
// empty for a reason that has nothing to do with the question.
registerButtonBehavior();

function committedWithId(
  viewName: string,
  tag: string,
): Readonly<Record<string, unknown>> {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(viewName, false, tag);
  routeProp(node, 'id', 'hero');
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error(`${tag} committed nothing`);
  return payload;
}

describe('what the ENGINE alone does with a bare id', () => {
  // why: a tag WITH a registered behavior. It was covered before this collapsed, by `foldIdAlias` in
  // the payload builder, and it still is — by `routeProp` now. Kept as the case that cannot regress
  // without something very large breaking.
  it('renames it on a tag whose behavior is registered', () => {
    const payload = committedWithId('RCTView', 'button');

    expect(payload.nativeID).toBe('hero');
    expect(payload.id).toBe(undefined);
  });

  // why: THE CASE THE COLLAPSE WAS FOR, and it read the other way an hour ago. A plain `<view>`
  // registers no behavior, so its tagName is empty in the host and no TAG rule can fire for it —
  // which meant the engine left the raw `id` standing and only the adapter's own fold saved it. The
  // commonest element in every app depended on which adapter was driving.
  it('renames it on a plain view, which carries no behavior at all', () => {
    const payload = committedWithId('RCTView', 'view');

    expect(payload.nativeID).toBe('hero');
    expect(payload.id).toBe(undefined);
  });

  // why: and `text`, asked separately because it reaches a different branch of the payload builder,
  // so one answer does not imply the other.
  it('renames it on a plain text, for the same reason', () => {
    const payload = committedWithId('RCTText', 'text');

    expect(payload.nativeID).toBe('hero');
    expect(payload.id).toBe(undefined);
  });

  // why: A THIRD-PARTY VIEW, and this is the deliberate behaviour CHANGE the collapse carries rather
  // than an accident. `foldHostBag` was keyed by `HOST_PRIMITIVES`, so it never touched a view this
  // project does not define, and `foldIdAlias`'s header names that as the reason it keys on the tag.
  // But Vue, Solid and Angular all folded per key with no such gate, so three of five adapters were
  // ALREADY renaming `id` on third-party views — the divergence, not the rename, was the bug.
  //
  // One answer for everybody, and it is upstream's: RN's own convention is `nativeID`, and a raw
  // `id` reaching Fabric is dropped whatever the view.
  it('renames it on a view this project does not define', () => {
    const payload = committedWithId('RNCSlider', 'slider');

    expect(payload.nativeID).toBe('hero');
    expect(payload.id).toBe(undefined);
  });
});

// THE PRECEDENCE, which is the half the per-key adapters had to build machinery for.
//
// `nativeID={this.props.id ?? this.props.nativeID}` (`View.js:77-79`) is a whole-BAG expression: RN
// sees both props at once and `id` wins. A renderer that folds one key at a time never sees both, so
// precedence would fall out of WRITE ORDER instead — `<view id nativeID>` keeping the stale legacy
// value while `<view nativeID id>` did not.
//
// Solid solved it with a `WeakSet` of nodes whose nativeID came from an `id`; Vue and Angular fold
// per key with no such memory and therefore resolve by order. These cases pin what the ENGINE does,
// which is what all five must agree with once the alias lives in one place.
function committedWriting(
  writes: ReadonlyArray<readonly [string, unknown]>,
): Readonly<Record<string, unknown>> {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTView', false, 'view');
  for (const [name, value] of writes) routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return payload;
}

describe('which of id and nativeID wins', () => {
  // why: `id` wins when both are authored, whichever order they were written in. Two cases in one
  // because the whole point is that the ANSWER does not depend on the order.
  it('gives id priority in either write order', () => {
    expect(
      committedWriting([
        ['id', 'from-id'],
        ['nativeID', 'from-native'],
      ]).nativeID,
    ).toBe('from-id');

    expect(
      committedWriting([
        ['nativeID', 'from-native'],
        ['id', 'from-id'],
      ]).nativeID,
    ).toBe('from-id');
  });

  // why: a bare `nativeID` with no `id` beside it is untouched — the alias adds a source, it does
  // not take one over.
  it('leaves a bare nativeID alone', () => {
    expect(committedWriting([['nativeID', 'from-native']]).nativeID).toBe(
      'from-native',
    );
  });

  // why: the raw key must never reach Fabric under either spelling. No ViewConfig declares `id`, so
  // it is dropped in silence — which is exactly why a rename that half-works is invisible.
  it('never sends the raw id', () => {
    expect(committedWriting([['id', 'hero']]).id).toBe(undefined);
    expect(
      committedWriting([
        ['id', 'hero'],
        ['nativeID', 'other'],
      ]).id,
    ).toBe(undefined);
  });

  // why: clearing the `id` releases the slot. A framework that unsets a prop between renders must
  // get the default back, and a latch here would pin a stale nativeID for the life of the node.
  it('clears the nativeID when the id that fed it is cleared', () => {
    expect(
      committedWriting([
        ['id', 'hero'],
        ['id', undefined],
      ]).nativeID,
    ).toBe(undefined);
  });
});

report();
