// Ported from wpt `css-properties-values-api/at-property.html`: which `@property` descriptors a
// registration takes, and what a registered name computes to when nothing declares it

import {
  clearGlobalStyles,
  clearRegisteredProperties,
  createElement,
  createSurface,
  getComputedVariable,
  registerProperties,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

type IApplied = readonly [syntax: string, initial: string, computed: string];
type ICase = readonly [syntax: string, initial: string | undefined];

const ROOT_TAG = 1;

let counter = 0;

function fresh(): void {
  clearGlobalStyles();
  clearRegisteredProperties();
}

function warningsOf(action: () => void): string[] {
  const warned: string[] = [];
  const original = console.warn;
  console.warn = (message: unknown) => warned.push(String(message));
  try {
    action();
  } finally {
    console.warn = original;
  }
  return warned;
}

function register(syntax: string, initialValue: string | undefined) {
  counter += 1;
  const name = `--p${counter}`;
  const rule = {
    name,
    syntax,
    inherits: false,
    ...(initialValue === undefined ? {} : { initialValue }),
  };
  return { name, warnings: warningsOf(() => registerProperties([rule])) };
}

function computedInitial(name: string): string {
  const node: ISymbioteNode = createElement('RCTView', false);
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return getComputedVariable(node, name);
}

const ACCEPTED: readonly ICase[] = [
  ['<color>', 'blue'],
  ['<color> | none', 'blue'],
  ['<color># | <image> | none', 'blue'],
  ['foo | <length>#', 'foo'],
  ['foo | bar | baz', 'foo'],
  ['notasyntax', 'notasyntax'],
  ['red', 'red'],
  ['*', undefined],
  [' * ', undefined],
  ['* ', undefined],
  ['\t*\t', undefined],
  ['*', '10px'],
  ['*', 'rgb(1, 2, 3)'],
  ['*', 'red'],
  ['*', 'foo'],
  ['*', 'foo(){}'],
];

const REFUSED: readonly ICase[] = [
  ['rgb(255, 0, 0)', 'rgb(255, 0, 0)'],
  ['default', 'default'],
  ['Default', 'Default'],
  ['initial', 'initial'],
  ['Initial', 'Initial'],
  ['inherit', 'inherit'],
  ['Inherit', 'Inherit'],
  ['unset', 'unset'],
  ['Unset', 'Unset'],
  ['revert', 'revert'],
  ['Revert', 'Revert'],
  ['revert-layer', 'revert-layer'],
  ['Revert-layer', 'Revert-layer'],
  ['foo bar', 'foo bar'],
  ['Foo <length>', 'Foo 42px'],
  ['foo, bar', 'foo, bar'],
  ['<length> <percentage>', '42px 100%'],
  ['|<length>', '42px'],
  ['<length>', '3em'],
  ['*', 'var(--x)'],
  ['<color>', undefined],
  ['<gandalf>', 'grey'],
  ['gandalf', 'grey'],
  ['<color>', 'notacolor'],
  ['<length>', '10em'],
  ['<string>', '1px'],
  ['<string>', 'foo'],
  ['<string>', 'calc(1 + 2)'],
  ['<string>', 'rgb(255, 99, 71)'],
  ['<string>', "'foo' 2px"],
  ['<transform-function>', 'translateX(1em)'],
  ['<transform-function>', 'translateY(1lh)'],
  ['<transform-list>', 'rotate(10deg) translateX(1em)'],
  ['<transform-list>', 'rotate(10deg) translateY(1lh)'],
];

const APPLIED: readonly IApplied[] = [
  ['*', 'foo(){}', 'foo(){}'],
  ['<angle>', '42deg', '42deg'],
  ['<angle>', '1turn', '360deg'],
  ['<color>', 'green', 'rgb(0, 128, 0)'],
  ['<color>', 'rgb(1, 2, 3)', 'rgb(1, 2, 3)'],
  ['<color>', 'tomato', 'rgb(255, 99, 71)'],
  ['<image>', 'url("http://a/")', 'url("http://a/")'],
  ['<integer>', '5', '5'],
  ['<length-percentage>', '10px', '10px'],
  ['<length-percentage>', '10%', '10%'],
  ['<length-percentage>', 'calc(10% + 10px)', 'calc(10% + 10px)'],
  ['<length>', '10px', '10px'],
  ['<number>', '2.5', '2.5'],
  ['<percentage>', '10%', '10%'],
  ['<resolution>', '50dppx', '50dppx'],
  ['<resolution>', '96dpi', '1dppx'],
  ['<time>', '10s', '10s'],
  ['<time>', '1000ms', '1s'],
  ['<transform-function>', 'rotateX(0deg)', 'rotateX(0deg)'],
  ['<transform-list>', 'rotateX(0deg)', 'rotateX(0deg)'],
  [
    '<transform-list>',
    'rotateX(0deg) translateX(10px)',
    'rotateX(0deg) translateX(10px)',
  ],
  ['<url>', 'url("http://a/")', 'url("http://a/")'],
  ['<string>', "'foo bar'", '"foo bar"'],
  ['<string>', " 'foo bar' ", '"foo bar"'],
  ['<string>', `'"foo" bar'`, '"\\"foo\\" bar"'],
  ['<string>', '"bar baz"', '"bar baz"'],
  ['<string>', `"bar 'baz'"`, `"bar 'baz'"`],
  ['<string>+', "'foo' 'bar'", '"foo" "bar"'],
  ['<string>#', "'foo', 'bar'", '"foo", "bar"'],
  ['<string>+ | <string>#', "'foo' 'bar'", '"foo" "bar"'],
  ['<string>+ | <string>#', `'foo' "bar"`, '"foo" "bar"'],
  ['<string># | <string>+', "'foo', 'bar' ", '"foo", "bar"'],
  ['<string># | <string>+', `"foo", 'bar'`, '"foo", "bar"'],
];

describe('an @property rule, which descriptors a registration takes', () => {
  for (const [syntax, initial] of ACCEPTED) {
    it(`takes syntax [${JSON.stringify(syntax)}] with initial [${initial}]`, () => {
      fresh();

      expect(register(syntax, initial).warnings).toEqual([]);
    });
  }

  for (const [syntax, initial] of REFUSED) {
    it(`refuses syntax [${JSON.stringify(syntax)}] with initial [${initial}]`, () => {
      fresh();
      const { name, warnings } = register(syntax, initial);

      expect(warnings.length).toBe(1);
      expect(computedInitial(name)).toBe('');
    });
  }
});

describe('an @property rule, what the registered name computes to', () => {
  for (const [syntax, initial, computed] of APPLIED) {
    it(`computes [${syntax}] with initial [${initial}] to [${computed}]`, () => {
      fresh();
      const { name, warnings } = register(syntax, initial);

      expect(warnings).toEqual([]);
      expect(computedInitial(name)).toBe(computed);
    });
  }
});

report();
