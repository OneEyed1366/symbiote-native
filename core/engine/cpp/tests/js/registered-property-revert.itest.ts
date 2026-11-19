// Ported from wpt `css-properties-values-api/registered-property-revert.html`
// Not ported: the two animated cases, there being no CSS animation of a custom property here

import { getComputedVariable } from '@symbiote-native/engine';

import { describe, expect, it, report } from './harness';
import {
  freshRegistry,
  mountPair,
  registerLength,
} from './registered-property-fixtures';

describe('revert on a registered custom property, as in wpt', () => {
  it('reverts an inherited property to the inherited value', () => {
    freshRegistry();
    registerLength('--inherited', '0px', true);
    const { inner } = mountPair(
      { '--inherited': '10px' },
      { '--inherited': 'revert' },
    );

    expect(getComputedVariable(inner, '--inherited')).toBe('10px');
  });

  it('reverts a non-inherited property to the initial value', () => {
    freshRegistry();
    registerLength('--non-inherited', '0px', false);
    const { inner } = mountPair(
      { '--non-inherited': '10px' },
      { '--non-inherited': 'revert' },
    );

    expect(getComputedVariable(inner, '--non-inherited')).toBe('0px');
  });
});

report();
