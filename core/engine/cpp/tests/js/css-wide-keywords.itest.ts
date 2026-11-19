// Ported from wpt `css-variables/variable-css-wide-keywords.html` and `css-properties-values-api/
// registered-property-revert.html`: a custom property declared as a CSS-wide keyword
// `revert` and `revert-layer` act as `unset` here, as no origin or layer sets the name

import {
  appendChild,
  clearGlobalStyles,
  clearRegisteredProperties,
  createElement,
  createSurface,
  getComputedVariable,
  registerProperty,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const LIGHTGREEN = 'rgb(144, 238, 144)';
const TOMATO = 'rgb(255, 99, 71)';
// Both keywords that fall back to the parent for an inheriting name and to the initial otherwise
const UNSETTING = ['unset', 'revert', 'revert-layer'] as const;

function view(style: Record<string, unknown>): ISymbioteNode {
  const node = createElement('RCTView', false);
  setProp(node, 'style', style);
  return node;
}

// A parent declaring `parentValue` for `--a`, and a child declaring `childValue` below it
function pair(parentValue: string, childValue: string): ISymbioteNode {
  const parent = view({ '--a': parentValue });
  const child = view({ '--a': childValue });
  appendChild(parent, child);
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(parent);
  surface.commit();
  mounted();
  return child;
}

function fresh(): void {
  clearGlobalStyles();
  clearRegisteredProperties();
}

function color(inherits: boolean): void {
  registerProperty({
    name: '--a',
    syntax: '<color>',
    inherits,
    initialValue: 'lightgreen',
  });
}

describe('a CSS-wide keyword on an unregistered custom property', () => {
  it('reads as guaranteed-invalid for initial', () => {
    fresh();
    const child = pair('tomato', 'initial');

    expect(getComputedVariable(child, '--a')).toBe('');
  });

  it('reads the parent for inherit', () => {
    fresh();
    const child = pair('tomato', 'inherit');

    expect(getComputedVariable(child, '--a')).toBe('tomato');
  });

  for (const keyword of UNSETTING) {
    it(`reads the parent for ${keyword}`, () => {
      fresh();
      const child = pair('tomato', keyword);

      expect(getComputedVariable(child, '--a')).toBe('tomato');
    });
  }

  it('takes the keyword whatever its case or padding', () => {
    fresh();
    const child = pair('tomato', '  INHERIT ');

    expect(getComputedVariable(child, '--a')).toBe('tomato');
  });

  it('skips a keyword to the next declaration above', () => {
    fresh();
    const grandparent = view({ '--a': 'lime' });
    const parent = view({ '--a': 'inherit' });
    const child = view({ '--a': 'inherit' });
    appendChild(grandparent, parent);
    appendChild(parent, child);
    const surface = createSurface(ROOT_TAG);
    surface.appendChild(grandparent);
    surface.commit();
    mounted();

    expect(getComputedVariable(child, '--a')).toBe('lime');
  });
});

describe('a CSS-wide keyword on a registered custom property', () => {
  for (const inherits of [false, true]) {
    const kind = inherits ? 'an inheriting' : 'a non-inheriting';

    it(`reads the initial value for initial on ${kind} one`, () => {
      fresh();
      color(inherits);
      const child = pair('tomato', 'initial');

      expect(getComputedVariable(child, '--a')).toBe(LIGHTGREEN);
    });

    it(`reads the parent for inherit on ${kind} one`, () => {
      fresh();
      color(inherits);
      const child = pair('tomato', 'inherit');

      expect(getComputedVariable(child, '--a')).toBe(TOMATO);
    });
  }

  for (const keyword of UNSETTING) {
    it(`reads the initial value for ${keyword} on a non-inheriting one`, () => {
      fresh();
      color(false);
      const child = pair('tomato', keyword);

      expect(getComputedVariable(child, '--a')).toBe(LIGHTGREEN);
    });

    it(`reads the parent for ${keyword} on an inheriting one`, () => {
      fresh();
      color(true);
      const child = pair('tomato', keyword);

      expect(getComputedVariable(child, '--a')).toBe(TOMATO);
    });
  }

  it('reverts an inherited length to the parent and a plain one to the initial value', () => {
    fresh();
    registerProperty({
      name: '--inherited',
      syntax: '<length>',
      inherits: true,
      initialValue: '0px',
    });
    registerProperty({
      name: '--plain',
      syntax: '<length>',
      inherits: false,
      initialValue: '0px',
    });
    const parent = view({ '--inherited': '10px', '--plain': '10px' });
    const child = view({ '--inherited': 'revert', '--plain': 'revert' });
    appendChild(parent, child);
    const surface = createSurface(ROOT_TAG);
    surface.appendChild(parent);
    surface.commit();
    mounted();

    expect(getComputedVariable(child, '--inherited')).toBe('10px');
    expect(getComputedVariable(child, '--plain')).toBe('0px');
  });
});

report();
