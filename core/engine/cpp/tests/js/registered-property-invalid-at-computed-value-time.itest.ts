// Ported from wpt `css-properties-values-api/invalid-at-computed-value-time.html`
// A value that fails at computed-value time unsets the property: inherited, else the initial value
// In `--p8` the wpt declaration is not a declaration at all, so the inner view declares nothing

import { getComputedVariable, registerProperty } from '@symbiote-native/engine';

import { describe, expect, it, report } from './harness';
import { freshRegistry, mountPair, mountTree, registerLength, view } from './registered-property-fixtures';

describe('an invalid value at computed-value time, as in wpt', () => {
  it('leaves a universal syntax with the guaranteed-invalid value for an undefined reference', () => {
    freshRegistry();
    registerProperty({ name: '--p1', syntax: '*', inherits: true, initialValue: '0px' });
    registerProperty({ name: '--p2', syntax: '*', inherits: false, initialValue: '0px' });
    const inherited = mountPair({ '--p1': '42px' }, { '--p1': 'var(--undefined)' });

    expect(getComputedVariable(inherited.inner, '--p1')).toBe('');

    const own = mountPair({ '--p2': '42px' }, { '--p2': 'var(--undefined)' });

    expect(getComputedVariable(own.inner, '--p2')).toBe('');
  });

  it('unsets the property for an undefined reference: inherited, else the initial value', () => {
    freshRegistry();
    registerLength('--p3', '0px', true);
    registerLength('--p4', '0px', false);
    const { inner } = mountPair(
      { '--p3': '42px', '--p4': '42px' },
      { '--incompatible': 'nolength', '--p3': 'var(--undefined)', '--p4': 'var(--undefined)' },
    );

    expect(getComputedVariable(inner, '--p3')).toBe('42px');
    expect(getComputedVariable(inner, '--p4')).toBe('0px');
  });

  it('unsets the property for a syntax-incompatible reference', () => {
    freshRegistry();
    registerLength('--p5', '0px', true);
    registerLength('--p6', '0px', false);
    const { inner } = mountPair(
      { '--p5': '42px', '--p6': '42px' },
      { '--incompatible': 'nolength', '--p5': 'var(--incompatible)', '--p6': 'var(--incompatible)' },
    );

    expect(getComputedVariable(inner, '--p5')).toBe('42px');
    expect(getComputedVariable(inner, '--p6')).toBe('0px');
  });

  it('unsets the property for a syntax-incompatible fallback', () => {
    freshRegistry();
    registerLength('--p7', '0px', true);
    registerLength('--p8', '0px', false);
    const { inner } = mountPair(
      { '--p7': '42px', '--p8': '42px' },
      { '--p7': 'var(--undefined, nolength)' },
    );

    expect(getComputedVariable(inner, '--p7')).toBe('42px');
    expect(getComputedVariable(inner, '--p8')).toBe('0px');
  });

  it('gives the initial value to an unset inherited property on the top node', () => {
    freshRegistry();
    registerLength('--p9', '0px', true);
    registerLength('--p10', '0px', true);
    registerLength('--p11', '0px', true);
    const top = view({
      '--incompatible': 'nolength',
      '--p9': 'var(--undefined)',
      '--p10': 'var(--incompatible)',
      '--p11': 'var(--undefined, nolength)',
    });
    mountTree(top);

    expect(getComputedVariable(top, '--p9')).toBe('0px');
    expect(getComputedVariable(top, '--p10')).toBe('0px');
    expect(getComputedVariable(top, '--p11')).toBe('0px');
  });
});

report();
