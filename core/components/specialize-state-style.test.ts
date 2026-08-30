// Specialising a state style callback at both values of `pressed`. The assertions EVALUATE the
// emitted objects rather than matching their text: a generated-code test that only pins the
// operator passes while the value is wrong (`.claude/rules/test-harness-false-greens.md` §10).
import { describe, expect, it } from 'vitest';
// Through `@babel/core` rather than `@babel/parser`/`@babel/generator` directly: those are
// transitive here, and a test that reaches past its package's own dependencies breaks on any
// hoisting change with an error that reads like a missing install.
import { transformSync, types } from '@babel/core';
import { specializeStateStyle } from './specialize-state-style.cjs';

// The expression is parsed by transforming a tiny module and plucking it back out, which keeps the
// whole test on one Babel copy.
function split(source: string) {
  let result: { base: types.Node; active: types.Node } | null = null;
  transformSync(`const _ = ${source};`, {
    configFile: false,
    babelrc: false,
    plugins: [
      () => ({
        visitor: {
          VariableDeclarator(path: { node: { init: types.Node } }) {
            result = specializeStateStyle(path.node.init, types);
          },
        },
      }),
    ],
  });
  return result;
}

// Evaluated with the free names bound, which is the point: a runtime prop must survive as an
// EXPRESSION in both copies, not be inlined or dropped.
function evaluate(node: types.Node, scope: Record<string, unknown> = {}) {
  const names = Object.keys(scope);
  const printed = transformSync('', {
    configFile: false,
    babelrc: false,
    code: true,
    plugins: [
      () => ({
        visitor: {
          Program(path: { pushContainer: (k: string, n: unknown) => void }) {
            path.pushContainer('body', types.expressionStatement(node));
          },
        },
      }),
    ],
  });
  const code = (printed?.code ?? '').replace(/;\s*$/, '');
  return new Function(...names, `return (${code});`)(
    ...names.map(name => scope[name]),
  );
}

describe('specializeStateStyle', () => {
  it('splits a ternary into the two branches', () => {
    const out = split('({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })');
    expect(evaluate(out.base)).toEqual({ opacity: 1 });
    expect(evaluate(out.active)).toEqual({ opacity: 0.6 });
  });

  // The reason this beats a `:active` CSS rule for some call sites: a CSS rule cannot carry a value
  // the caller passes in, and this can, because nothing is evaluated at build time.
  it('carries a free runtime name through BOTH copies untouched', () => {
    const out = split(
      '({ pressed }) => ({ borderColor: color, opacity: pressed ? 0.6 : 1 })',
    );
    expect(evaluate(out.base, { color: '#f00' })).toEqual({
      borderColor: '#f00',
      opacity: 1,
    });
    expect(evaluate(out.active, { color: '#f00' })).toEqual({
      borderColor: '#f00',
      opacity: 0.6,
    });
  });

  it('folds a logical and a negation, not just a ternary', () => {
    const out = split(
      '({ pressed }) => ({ a: pressed && 2, b: !pressed ? 3 : 4 })',
    );
    expect(evaluate(out.base)).toEqual({ a: false, b: 3 });
    expect(evaluate(out.active)).toEqual({ a: 2, b: 4 });
  });

  it('accepts a block body with a single return', () => {
    const out = split(
      '({ pressed }) => { return { opacity: pressed ? 0.6 : 1 }; }',
    );
    expect(evaluate(out.active)).toEqual({ opacity: 0.6 });
  });

  // A property KEY named `pressed`, and `x.pressed`, are not references to the parameter. Blind
  // identifier matching rewrites both and silently produces `{ true: 1 }`.
  it('does not rewrite a property key or a member property named pressed', () => {
    const out = split('({ pressed }) => ({ pressed: 1, v: state.pressed })');
    expect(evaluate(out.active, { state: { pressed: 'kept' } })).toEqual({
      pressed: 1,
      v: 'kept',
    });
  });

  // Written as a refusal first, and the implementation was right and the expectation wrong: a
  // computed key IS a state reference, so substituting it is the correct answer rather than a case
  // to bail on. Kept as a passing case so nobody re-adds it to the refusal list.
  it('specialises a COMPUTED key that uses the state', () => {
    const out = split('({ pressed }) => ({ [pressed ? "on" : "off"]: 1 })');
    expect(evaluate(out.base)).toEqual({ off: 1 });
    expect(evaluate(out.active)).toEqual({ on: 1 });
  });

  it.each([
    ['a non-object body', '({ pressed }) => pressed ? a : b'],
    ['an identifier param', 'state => ({ opacity: state.pressed ? 0.6 : 1 })'],
    ['two params', '({ pressed }, x) => ({ opacity: 1 })'],
    ['an unknown state key', '({ hovered }) => ({ opacity: 1 })'],
    [
      'a nested function that could shadow',
      '({ pressed }) => ({ f: () => pressed })',
    ],
    [
      'a multi-statement body',
      '({ pressed }) => { const x = 1; return { x }; }',
    ],
  ])('refuses %s', (_label, source) => {
    expect(split(source)).toBeNull();
  });
});
