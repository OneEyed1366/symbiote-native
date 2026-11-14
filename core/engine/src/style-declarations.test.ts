// A style that declares a `--x` tells the host to scan it, any other style costs the host nothing

import { beforeEach, describe, expect, it } from 'vitest';

import {
  OP_SET_PROP,
  OP_STRIDE,
  resetMutationBuffer,
  takeBatch,
} from './mutation-buffer';
import { createElement, setProp } from './node';
import { declaresVariables } from './style-declarations';

const DECLARES = 1;

// The scan flag word of the last `style` write in the batch
function flagOfLastStyleWrite(): number | undefined {
  const { ops } = takeBatch();
  for (let at = ops.length - OP_STRIDE; at >= 0; at -= OP_STRIDE) {
    if (ops[at] === OP_SET_PROP) return ops[at + 4];
  }
  return undefined;
}

describe('which styles declare a variable', () => {
  it('finds a --x key in a plain style object', () => {
    expect(declaresVariables({ '--accent': '#fff', margin: 1 })).toBe(true);
  });

  it('finds a --x key inside a style array, however deep', () => {
    expect(declaresVariables([{ margin: 1 }, [null, { '--gap': '4px' }]])).toBe(true);
  });

  it('is false for a style with no custom property', () => {
    expect(declaresVariables([{ margin: 1 }, undefined, { color: 'var(--c)' }])).toBe(false);
  });

  it('is false for a value that is not a style', () => {
    expect(declaresVariables(undefined)).toBe(false);
    expect(declaresVariables('--x')).toBe(false);
  });
});

describe('the flag word of a style write', () => {
  beforeEach(() => {
    resetMutationBuffer();
  });

  it('is set when the style declares a variable', () => {
    const node = createElement('RCTView');
    takeBatch();

    setProp(node, 'style', [{ margin: 1 }, { '--accent': '#fff' }]);

    expect(flagOfLastStyleWrite()).toBe(DECLARES);
  });

  it('stays clear for a style without one', () => {
    const node = createElement('RCTView');
    takeBatch();

    setProp(node, 'style', { margin: 1, backgroundColor: 'var(--accent)' });

    expect(flagOfLastStyleWrite()).toBe(0);
  });

  it('stays clear for a prop that is not the style', () => {
    const node = createElement('RCTView');
    takeBatch();

    setProp(node, 'accessibilityLabel', '--x');

    expect(flagOfLastStyleWrite()).toBe(0);
  });
});
