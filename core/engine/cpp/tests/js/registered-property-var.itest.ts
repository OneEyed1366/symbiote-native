// Ported from wpt `css-properties-values-api/var-reference-registered-properties.html`
// A `var()` that reads a typed property gets its computed value, and a bad one falls back

import {
  clearGlobalStyles,
  clearRegisteredProperties,
  committedPayloadOf,
  createElement,
  createSurface,
  getComputedVariable,
  registerProperty,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

function view(style: Record<string, unknown>): ISymbioteNode {
  const node = createElement('RCTView', false);
  setProp(node, 'style', style);
  return node;
}

function mount(root: ISymbioteNode): void {
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(root);
  surface.commit();
  mounted();
}

function fresh(): void {
  clearGlobalStyles();
  clearRegisteredProperties();
}

function lengths(...names: string[]): void {
  for (const name of names) {
    registerProperty({ name, syntax: '<length>', inherits: false, initialValue: '0px' });
  }
}

describe('a var() reading registered properties, as in wpt', () => {
  it('resolves a chain of typed lengths to computed values', () => {
    fresh();
    lengths('--r1', '--r2', '--r3', '--r4', '--r5', '--r6');
    const node = view({
      '--r1': '10px',
      '--r2': 'var(--r1)',
      '--r3': 'var(--u1)',
      '--r4': 'calc(var(--u1) + 40px)',
      '--r5': 'var(--invalid, 70px)',
      '--r6': 'calc(var(--r3) * 4)',
      '--u1': '20px',
    });
    mount(node);

    expect(getComputedVariable(node, '--r1')).toBe('10px');
    expect(getComputedVariable(node, '--r2')).toBe('10px');
    expect(getComputedVariable(node, '--r3')).toBe('20px');
    expect(getComputedVariable(node, '--r4')).toBe('60px');
    expect(getComputedVariable(node, '--r5')).toBe('70px');
    expect(getComputedVariable(node, '--r6')).toBe('80px');
    expect(getComputedVariable(node, '--u1')).toBe('20px');
  });

  it('reads a typed property inside the fallback of another reference', () => {
    fresh();
    lengths('--r7');
    registerProperty({ name: '--px123', syntax: '<length>', inherits: false, initialValue: '123px' });
    const node = view({ '--r7': 'var(--px123, 6px)' });
    mount(node);

    expect(getComputedVariable(node, '--r7')).toBe('123px');
  });

  it('falls back to the initial value when the substituted text fails the syntax', () => {
    fresh();
    registerProperty({ name: '--bad', syntax: '<length>', inherits: false, initialValue: '15px' });
    const node = view({ '--bad': 'var(--percentage)', '--percentage': '10%' });
    mount(node);

    expect(getComputedVariable(node, '--bad')).toBe('15px');
  });

  it('serializes an invalid universal reference as empty and uses the fallback', () => {
    fresh();
    registerProperty({ name: '--s1', syntax: '*', inherits: false });
    registerProperty({ name: '--s2', syntax: '*', inherits: false });
    const node = view({
      '--s1': 'var(--invalid)',
      '--s2': 'var(--invalid, fallback)',
      '--plain': 'var(--s1, moo)',
    });
    mount(node);

    expect(getComputedVariable(node, '--s1')).toBe('');
    expect(getComputedVariable(node, '--s2')).toBe('fallback');
    expect(getComputedVariable(node, '--plain')).toBe('moo');
  });

  it('keeps a valid declaration over a reference whose fallback fails the syntax', () => {
    fresh();
    registerProperty({ name: '--len', syntax: '<length>', inherits: false, initialValue: '0px' });
    const node = view({ '--len': '40px', '--x': 'var(--len, red)' });
    mount(node);

    expect(getComputedVariable(node, '--x')).toBe('40px');
  });
});

describe('a typed list or a relative unit read through var(), as in wpt', () => {
  it('concatenates registered lists that reference typed and untyped names', () => {
    fresh();
    lengths('--r1');
    for (const name of ['--l1', '--l2', '--l3']) {
      registerProperty({ name, syntax: '<length>#', inherits: false, initialValue: '0px' });
    }
    const node = view({
      '--r1': '10px',
      '--u1': '20px',
      '--l1': '1px, var(--r1), 2px',
      '--l2': '1px, var(--u1), var(--r1), 2px',
      '--l3': 'var(--l1), var(--l2)',
    });
    mount(node);

    expect(getComputedVariable(node, '--l1')).toBe('1px, 10px, 2px');
    expect(getComputedVariable(node, '--l2')).toBe('1px, 20px, 10px, 2px');
    expect(getComputedVariable(node, '--l3')).toBe('1px, 10px, 2px, 1px, 20px, 10px, 2px');
  });

  it('absolutizes a font-relative length when an untyped name reads it', () => {
    fresh();
    lengths('--em');
    registerProperty({ name: '--em-calc', syntax: '<length>', inherits: false, initialValue: '0px' });
    const node = view({
      '--em': '10em',
      '--em-calc': 'calc(10em + 10px)',
      '--a': 'var(--em)',
      '--b': 'var(--em-calc)',
    });
    mount(node);

    expect(getComputedVariable(node, '--a')).toBe('160px');
    expect(getComputedVariable(node, '--b')).toBe('170px');
  });

  it('absolutizes the items of a typed list when an untyped name reads it', () => {
    fresh();
    registerProperty({ name: '--em-list', syntax: '<length>#', inherits: false, initialValue: '0px' });
    const node = view({ '--em-list': '10em, calc(10em + 10px)', '--a': 'var(--em-list)' });
    mount(node);

    expect(getComputedVariable(node, '--a')).toBe('160px, 170px');
  });

  it('absolutizes a value substituted into a universal property', () => {
    fresh();
    registerProperty({ name: '--len', syntax: 'none | <length>', inherits: false, initialValue: 'none' });
    registerProperty({ name: '--any', syntax: '*', inherits: false });
    const node = view({ '--len': '10em', '--any': 'var(--len)' });
    mount(node);

    expect(getComputedVariable(node, '--any')).toBe('160px');
  });

  it('lets a fallback that fails the syntax leave a valid reference alone', () => {
    fresh();
    registerProperty({ name: '--k', syntax: '<length> | none', inherits: false, initialValue: 'none' });
    const node = view({ '--k': '40px', '--a': 'var(--k, nolength)', '--b': 'var(--k, var(--novar))' });
    mount(node);

    expect(getComputedVariable(node, '--a')).toBe('40px');
    expect(getComputedVariable(node, '--b')).toBe('40px');
  });

  it('reads the initial value when the declared literal fails the syntax', () => {
    fresh();
    registerProperty({ name: '--len', syntax: '<length>', inherits: false, initialValue: '0px' });
    const node = view({ '--len': 'red', '--plain': 'var(--len)' });
    mount(node);

    expect(getComputedVariable(node, '--len')).toBe('0px');
    expect(getComputedVariable(node, '--plain')).toBe('0px');
  });

  // Ported from wpt `at-property-optional-initial-value.html`
  it('substitutes an empty initial value as nothing', () => {
    fresh();
    registerProperty({ name: '--registered', syntax: '*', inherits: false, initialValue: '' });
    const node = view({
      '--test-bg': 'var(--registered) green',
      '--test-fallback': 'var(--registered, red)',
      backgroundColor: 'var(--test-bg, var(--test-fallback))',
    });
    mount(node);

    expect(committedPayloadOf(node)?.backgroundColor).toBe(0xff00_8000);
  });

  it('keeps a universal property without an initial value guaranteed-invalid', () => {
    fresh();
    registerProperty({ name: '--registered', syntax: '*', inherits: false });
    const node = view({
      '--test-bg': 'var(--registered) green',
      '--test-fallback': 'var(--registered, red)',
      backgroundColor: 'var(--test-bg, var(--test-fallback))',
    });
    mount(node);

    expect(committedPayloadOf(node)?.backgroundColor).toBe(0xffff_0000);
  });
});

report();
