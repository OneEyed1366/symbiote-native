// Two nodes styled the same way should send the host ONE style value, not two identical ones.

// why: pushClassStyle publishes a fresh [classStyle, explicitStyle] array per node, so a thousand
// rows sharing one StyleSheet.create object still produced a thousand distinct arrays and a
// thousand identical folly::dynamic conversions — mutation-buffer.ts interns by identity only.

// The sharing is keyed on the two parts by identity, held in WeakMaps, so a caller that builds a
// fresh style object per render gets nothing — correctly, since two structurally equal objects are
// two values to anyone reading them later, and a deep compare would cost the size of the style.

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

  // The no-op re-render, the commonest shape there is: a component body builds a fresh style
  // object every render, equal to the one standing. Identity alone can't see that, so without this
  // the write crossed into the host and converted before being found unchanged.
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

  // why: conservative on anything nested — a deep compare would cost the size of the style, so
  // these keep crossing and the host's own diffProps refuses them exactly as before.
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
