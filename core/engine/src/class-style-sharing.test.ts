// Two nodes styled the same way should send the host ONE style value, not two identical ones.
//
// why: `pushClassStyle` publishes a fresh `[classStyle, explicitStyle]` array per node. That array
// is what crosses as the `style` prop, and the host turns each entry of the batch's value table into
// a `folly::dynamic` — so a thousand rows sharing one `StyleSheet.create` object still produced a
// thousand distinct arrays and a thousand identical conversions. `mutation-buffer.ts` interns by
// IDENTITY, which is the right rule and could not see them.
//
// Measured on `build-release` before this (`raw-fabric-vs-engine.itest.ts`): 12 005 `setProp` ops
// folded to 9 005 value-table entries, and the 4 000 that refused to fold were exactly the style
// writes — three shared style objects across a thousand rows, arriving as four thousand arrays.
//
// The sharing is keyed on the two parts by identity and held in `WeakMap`s, so a caller that builds
// a fresh style object per render gets nothing — correctly, since two structurally equal objects are
// two values to anyone reading them later, and a deep compare would make the cost depend on the size
// of every style in the app.

import { describe, expect, it } from 'vitest';

import {
  resetMutationBuffer,
  takeBatch,
  type IMutationBatch,
} from './mutation-buffer';
import { createElement, routeProp } from './node';

/** The style arrays a batch carried, which is what the host will convert one by one. */
function styleValuesOf(batch: IMutationBatch): readonly unknown[] {
  return batch.values.filter(value => Array.isArray(value));
}

describe('the style slot is shared between nodes styled the same way', () => {
  // why: the case the sharing exists for — one hoisted style object across a list.
  it('sends one array when many nodes carry the same style object', () => {
    resetMutationBuffer();
    const style = { height: 44, flexDirection: 'row' };
    for (let at = 0; at < 5; at += 1) {
      routeProp(createElement('RCTView'), 'style', style);
    }

    const values = styleValuesOf(takeBatch());
    expect(values.length).toBe(1);
  });

  // why: IDENTITY, and this pins the limit rather than leaving it to look like a bug. A style rebuilt
  // per render is a different value, and folding it would mean a deep compare on every prop write.
  it('sends two arrays for two equal but distinct style objects', () => {
    resetMutationBuffer();
    routeProp(createElement('RCTView'), 'style', { flex: 1 });
    routeProp(createElement('RCTView'), 'style', { flex: 1 });

    expect(styleValuesOf(takeBatch()).length).toBe(2);
  });

  // why: the shared array must still carry the right CONTENT. Sharing that handed a node another
  // node's style would be silent and would be visible only on a screen.
  it('carries the explicit style in the slot the payload builder reads', () => {
    resetMutationBuffer();
    const style = { flex: 1 };
    routeProp(createElement('RCTView'), 'style', style);

    const values = styleValuesOf(takeBatch());
    expect(values.length).toBe(1);
    const published = values[0];
    if (!Array.isArray(published))
      throw new Error('style did not publish an array');
    expect(published[1]).toBe(style);
  });

  // ── THE NO-OP RE-RENDER, WHICH IS THE COMMONEST SHAPE THERE IS ─────────────────────────────────
  //
  // A component body that builds its style inline hands over a FRESH object every render, equal to
  // the one already standing. Identity cannot see that, so the write crossed into the host, was
  // converted to a `folly::dynamic`, and only then compared — and the comparison said "unchanged".
  // Measured on `build-release` (`no-op-rerender-cost.itest.ts`), 1 000 rows re-rendered with no
  // change at all: 9.7 ms against 0.3 ms for the same app with the style hoisted, and 5.2 ms of the
  // 9.7 was that conversion.
  //
  // The cheapest place to refuse a write is the earliest place that can see it is a no-op.
  it('records nothing when a rebuilt style equals the one standing', () => {
    resetMutationBuffer();
    const node = createElement('RCTView');
    routeProp(node, 'style', { height: 44, flexDirection: 'row' });
    takeBatch();

    routeProp(node, 'style', { height: 44, flexDirection: 'row' });
    expect(takeBatch().values.length).toBe(0);
  });

  // why: the guard must be an equality test, not a "looks similar" test. Each of these is a real
  // change an app makes, and each must still reach the host.
  it('records a rebuilt style that differs in a value, a key, or a count', () => {
    const cases: Record<string, unknown>[] = [
      { height: 48, flexDirection: 'row' },
      { height: 44, flexDirection: 'column' },
      { height: 44, flexDirection: 'row', paddingLeft: 10 },
      { height: 44 },
      { height: 44, alignItems: 'row' },
    ];
    for (const next of cases) {
      resetMutationBuffer();
      const node = createElement('RCTView');
      routeProp(node, 'style', { height: 44, flexDirection: 'row' });
      takeBatch();

      routeProp(node, 'style', next);
      expect(takeBatch().values.length).toBe(1);
    }
  });

  // why: CONSERVATIVE on anything nested. A style holding an array or an object (a transform list, a
  // shadow, a nested style array) would need a deep compare to refuse, and a deep compare makes the
  // guard cost the size of the style — which is the cost it exists to avoid. Those keep crossing,
  // and the host's own `diffProps` refuses them exactly as it did before.
  it('lets a style carrying a nested value through rather than comparing deeply', () => {
    resetMutationBuffer();
    const node = createElement('RCTView');
    routeProp(node, 'style', { transform: [{ scale: 1 }] });
    takeBatch();

    routeProp(node, 'style', { transform: [{ scale: 1 }] });
    expect(takeBatch().values.length).toBe(1);
  });

  // why: two DIFFERENT styles must not collapse onto one entry. The cache is keyed on the parts, so
  // a bug that ignored the key would show up here and nowhere else in this file.
  it('keeps two different style objects apart', () => {
    resetMutationBuffer();
    const first = { flex: 1 };
    const second = { flex: 2 };
    routeProp(createElement('RCTView'), 'style', first);
    routeProp(createElement('RCTView'), 'style', second);
    routeProp(createElement('RCTView'), 'style', first);

    const values = styleValuesOf(takeBatch());
    expect(values.length).toBe(2);
  });
});
