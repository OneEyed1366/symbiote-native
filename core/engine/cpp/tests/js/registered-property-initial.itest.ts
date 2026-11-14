// Ported from wpt `css-properties-values-api/registered-property-initial.html`: the initial value
// of a typed property is its computed value, and that is the text a `var()` substitutes

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

type ICase = readonly [syntax: string, initial: string, computed: string];

const ROOT_TAG = 1;

const COMPUTED: readonly ICase[] = [
  ['<length>', 'calc(10px + 15px)', '25px'],
  ['<length>', '1in', '96px'],
  ['<length>', '2.54cm', '96px'],
  ['<length>', '25.4mm', '96px'],
  ['<length>', '6pc', '96px'],
  ['<length>', '72pt', '96px'],
  ['<percentage>', 'calc(10% + 20%)', '30%'],
  ['<length-percentage>', 'calc(1in + 10% + 4px)', 'calc(10% + 100px)'],
  ['<color>', 'pink', 'rgb(255, 192, 203)'],
  ['<color>', 'purple', 'rgb(128, 0, 128)'],
  ['<transform-function>', 'rotate(42deg)', 'rotate(42deg)'],
  ['<transform-list>', 'scale(calc(2 + 2))', 'scale(4)'],
  ['<transform-list>', 'scale(calc(2 + 1)) translateX(calc(3px + 1px))', 'scale(3) translateX(4px)'],
];

// A registered name read through an untyped one substitutes as its computed value
const SUBSTITUTED: readonly ICase[] = [
  ['foo', '\tfoo\t', 'foo'],
  ['<angle>', '\t1turn', '360deg'],
  ['<color>', ' pink ', 'rgb(255, 192, 203)'],
  ['<custom-ident>', '\ttest', 'test'],
  ['<integer>', 'calc(20 + 20 + 10)', '50'],
  ['<length-percentage>', '\tcalc(13% + 37px)', 'calc(13% + 37px)'],
  ['<length>', 'calc(10px + 15px)', '25px'],
  ['<number>', 'calc(13 + 37)', '50'],
  ['<percentage>', 'calc(13% + 37%)', '50%'],
  ['<time>', '2000ms', '2s'],
  ['<transform-function>', 'scale(calc(2 + 2))', 'scale(4)'],
  ['<transform-list>', 'scale(calc(2 + 2)) translateX(calc(3px + 1px))', 'scale(4) translateX(4px)'],
];

let counter = 0;

function fresh(): void {
  clearGlobalStyles();
  clearRegisteredProperties();
}

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

function registered(syntax: string, initialValue: string, inherits: boolean): string {
  counter += 1;
  const name = `--q${counter}`;
  registerProperty({ name, syntax, inherits, initialValue });
  return name;
}

describe('the initial value of a registered property, as in wpt', () => {
  for (const [syntax, initial, computed] of COMPUTED) {
    it(`computes [${syntax}] with initial [${initial}] to [${computed}]`, () => {
      fresh();
      const name = registered(syntax, initial, false);
      const node = view({});
      mount(node);

      expect(getComputedVariable(node, name)).toBe(computed);
    });
  }

  for (const [syntax, initial, computed] of SUBSTITUTED) {
    it(`substitutes [${syntax}] with initial [${initial}] as [${computed}]`, () => {
      fresh();
      const name = registered(syntax, initial, false);
      const node = view({ '--x': `var(${name})` });
      mount(node);

      expect(getComputedVariable(node, '--x')).toBe(computed);
    });
  }

  it('substitutes an inherited initial colour into a colour property', () => {
    fresh();
    const name = registered('<color>', 'purple', true);
    const node = view({ color: `var(${name})` });
    mount(node);

    expect(committedPayloadOf(node)?.color).toBe(0xff80_0080);
  });

  it('substitutes a non-inherited initial colour into a colour property', () => {
    fresh();
    const name = registered('<color>', 'pink', false);
    const node = view({ backgroundColor: `var(${name})` });
    mount(node);

    expect(committedPayloadOf(node)?.backgroundColor).toBe(0xffff_c0cb);
  });
});

report();
