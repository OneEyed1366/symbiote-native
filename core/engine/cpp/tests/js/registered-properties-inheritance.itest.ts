// Ported from wpt `css-properties-values-api/registered-properties-inheritance.html`
// The inherits flag decides what a child sees, and an invalid value falls back to the inherited one
// Not ported: the font-relative case, since the engine has no inherited font size (decision 83)

import { getComputedVariable } from '@symbiote-native/engine';

import { describe, expect, it, report } from './harness';
import {
  freshRegistry,
  mountPair,
  registerLength,
} from './registered-property-fixtures';

describe('registered properties and the inherits flag, as in wpt', () => {
  it('inherits or not by the flag, and resolves references on the element that declares them', () => {
    freshRegistry();
    registerLength('--inherited-length-1', '1px', true);
    registerLength('--inherited-length-2', '2px', true);
    registerLength('--inherited-length-3', '3px', true);
    registerLength('--non-inherited-length-1', '4px', false);
    registerLength('--non-inherited-length-2', '5px', false);
    registerLength('--non-inherited-length-3', '6px', false);
    const { outer, inner } = mountPair(
      {
        '--inherited-length-1': '10px',
        '--inherited-length-2': 'var(--non-inherited-length-1)',
        '--inherited-length-3': '30px',
        '--non-inherited-length-1': '22px',
        '--non-inherited-length-3': 'calc(var(--non-inherited-length-2) * 10)',
      },
      {
        '--inherited-length-3': '15px',
        '--non-inherited-length-1': '40px',
        '--non-inherited-length-2': '90px',
      },
    );

    expect(getComputedVariable(outer, '--inherited-length-1')).toBe('10px');
    expect(getComputedVariable(outer, '--inherited-length-2')).toBe('22px');
    expect(getComputedVariable(outer, '--inherited-length-3')).toBe('30px');
    expect(getComputedVariable(outer, '--non-inherited-length-1')).toBe('22px');
    expect(getComputedVariable(outer, '--non-inherited-length-2')).toBe('5px');
    expect(getComputedVariable(outer, '--non-inherited-length-3')).toBe('50px');

    expect(getComputedVariable(inner, '--inherited-length-1')).toBe('10px');
    expect(getComputedVariable(inner, '--inherited-length-2')).toBe('22px');
    expect(getComputedVariable(inner, '--inherited-length-3')).toBe('15px');
    expect(getComputedVariable(inner, '--non-inherited-length-1')).toBe('40px');
    expect(getComputedVariable(inner, '--non-inherited-length-2')).toBe('90px');
    expect(getComputedVariable(inner, '--non-inherited-length-3')).toBe('6px');
  });

  it('gives the initial value to an explicit inherit from a parent with an invalid value', () => {
    freshRegistry();
    registerLength('--initial-length-1', '0px', false);
    const { inner } = mountPair(
      { '--initial-length-1': 'notalength' },
      { '--initial-length-1': 'inherit' },
    );

    expect(getComputedVariable(inner, '--initial-length-1')).toBe('0px');
  });

  it('gives the initial value to an explicit inherit from a parent with no value', () => {
    freshRegistry();
    registerLength('--initial-length-2', '0px', false);
    const { inner } = mountPair({}, { '--initial-length-2': 'inherit' });

    expect(getComputedVariable(inner, '--initial-length-2')).toBe('0px');
  });

  it('gives the value of the parent to an explicit inherit', () => {
    freshRegistry();
    registerLength('--initial-length-3', '0px', false);
    const { inner } = mountPair(
      { '--initial-length-3': '100px' },
      { '--initial-length-3': 'inherit' },
    );

    expect(getComputedVariable(inner, '--initial-length-3')).toBe('100px');
  });

  it('inherits the value when the reference is to an undefined variable', () => {
    freshRegistry();
    registerLength('--inherited-length-4', '0px', true);
    const { inner } = mountPair(
      { '--inherited-length-4': '42px' },
      { '--inherited-length-4': 'var(--undefined)' },
    );

    expect(getComputedVariable(inner, '--inherited-length-4')).toBe('42px');
  });

  it('inherits the value when the reference is to a syntax-incompatible variable', () => {
    freshRegistry();
    registerLength('--inherited-length-5', '0px', true);
    const { inner } = mountPair(
      { '--inherited-length-5': '42px' },
      {
        '--incompatible': 'nolength',
        '--inherited-length-5': 'var(--incompatible)',
      },
    );

    expect(getComputedVariable(inner, '--inherited-length-5')).toBe('42px');
  });

  it('resolves calc() before the value is inherited', () => {
    freshRegistry();
    registerLength('--calc-length', '0px', true);
    const { inner } = mountPair(
      { '--calc-length': 'calc(10px + 10px)' },
      { '--unregistered': 'var(--calc-length)' },
    );

    expect(getComputedVariable(inner, '--unregistered')).toBe('20px');
  });
});

report();
