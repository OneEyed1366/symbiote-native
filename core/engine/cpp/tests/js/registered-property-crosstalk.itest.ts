// Ported from wpt `css-properties-values-api/registered-property-crosstalk.html`
// A declaration on one node reaches only that node and what inherits from it

import {
  appendChild,
  getComputedVariable,
  registerProperty,
} from '@symbiote-native/engine';

import { describe, expect, it, report } from './harness';
import { freshRegistry, mountTree, view } from './registered-property-fixtures';

describe('a registered property across unrelated declarations, as in wpt', () => {
  it('lets only the node declaring it differ from the initial value', () => {
    freshRegistry();
    registerProperty({
      name: '--x',
      syntax: '<number>',
      inherits: true,
      initialValue: '0',
    });
    const a = view({ '--y': '0' });
    const b = view({ '--z': '0' });
    const c = view({ '--x': '42' });
    appendChild(a, b);
    appendChild(b, c);
    mountTree(a);

    expect(getComputedVariable(a, '--x')).toBe('0');
    expect(getComputedVariable(b, '--x')).toBe('0');
    expect(getComputedVariable(c, '--x')).toBe('42');
  });
});

report();
