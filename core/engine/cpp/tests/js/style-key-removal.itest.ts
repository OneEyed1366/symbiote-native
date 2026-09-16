// Regression for a clone-on-write bug that only a Fabric-faithful prop MERGE can reveal: real
// Fabric's `cloneNodeWithNewProps` merges the raw diff onto a node's EXISTING props, so a folded
// key that simply stops appearing inside `style` between two commits (not an explicit
// `setProp(..., undefined)`) must still reach the clone as an explicit null, or the stale value
// survives on the committed tree. `SymbioteFabricProps.cpp`'s `diffProps` is the code that has to
// notice the vanished key and re-send it as null — this is that function's own behavior, proven
// against the real committed tree rather than any JS-side stand-in.
//
// Ported off a React/Pressable-level regression (`adapters/react/src/__tests__/clone-prop-
// removal.test.tsx`, kept as a skip stub pointing here) — this drives the same fold-and-diff at
// the engine's own boundary, with no adapter in the way.

import { createElement, createSurface, setProp } from '@symbiote-native/engine';

import { describe, expect, findCommitted, it, report } from './harness';

const PROBE_ID = 'probe';

describe('a folded style key that vanishes between commits', () => {
  // why: `pressed ? { opacity: 0.2 } : {}` — the shape Pressable's style callback returns — never
  // explicitly nulls `opacity`, it simply stops including the key. `diffProps` compares the
  // FOLDED payload against what it last committed, so this has to hold at the fold, not at the
  // raw style object.
  it('re-sends the vanished key as an explicit null rather than leaving it stale', () => {
    const surface = createSurface(1);
    const view = createElement('RCTView');
    setProp(view, 'testID', PROBE_ID);
    setProp(view, 'style', { opacity: 0.2 });
    surface.appendChild(view);
    surface.commit();

    let probe = findCommitted(node => node.props.testID === PROBE_ID);
    if (probe === undefined) throw new Error('the probe view did not commit');
    // getDebugProps() stringifies every field it selects — committed-props.itest.ts's own note.
    expect(probe.props.opacity).toBe('0.2');

    setProp(view, 'style', {});
    surface.commit();

    probe = findCommitted(node => node.props.testID === PROBE_ID);
    if (probe === undefined) throw new Error('the probe view did not commit');
    expect(probe.props.opacity).toBe(undefined);
  });
});

report();
