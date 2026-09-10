// `experimental_background{Size,Position,Repeat}` are three of the ten style keys RN parses in JS
// before native. The processor table carried the fourth (`experimental_backgroundImage`) and not
// these, so a CSS string for any of them reached Fabric as a raw string.
//
// That is the exact shape of the process-transform incident: Fabric's C++ expects the parsed
// structure, a string is not it, and nothing throws - the declaration is silently dropped (iOS) or
// cast to the wrong native type (Android). Invisible to every other assertion, because none of
// them reads these three keys at all.
//
// The expectations come from reading RN's own parsers, not from our output. Two of them look like
// typos and are not:
//   - `getValidLengthPercentageSizeOrNull` (processBackgroundSize.js:75) accepts only px, % and
//     `auto`, so a single length yields `y: 'auto'`.
//   - a bare `left` is a POSITION keyword pair, not a single axis: `{top: '50%', left: '0%'}`.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { createElement, createSurface, routeProp } from '../index';

const fabric = installFabric();
let nextRootTag = 8700;

function commitStyle(style: Record<string, unknown>) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  routeProp(node, 'style', style);
  surface.appendChild(node);
  surface.commit();
  return fabric.appRoot().children[0];
}

function committedValue(key: string, css: string): unknown {
  return commitStyle({ [key]: css }).props[key];
}

describe('the background longhands reach Fabric parsed, never as a CSS string', () => {
  // why: two lengths are the unambiguous form - both axes explicit, no defaulting to argue about.
  it('parses a two-length backgroundSize', () => {
    expect(
      committedValue('experimental_backgroundSize', '100px 200px'),
    ).toEqual([{ x: 100, y: 200 }]);
  });

  // why: one length means the other axis is auto. This is the rule an app hits by default, and the
  // one a hand-port would most likely get wrong.
  it('defaults the second axis of a one-length backgroundSize to auto', () => {
    expect(committedValue('experimental_backgroundSize', '50%')).toEqual([
      { x: '50%', y: 'auto' },
    ]);
  });

  // why: a keyword position is a PAIR - RN resolves the unnamed axis to the centre rather than
  // leaving it absent, so the payload must carry both.
  it('resolves a keyword backgroundPosition to both axes', () => {
    expect(committedValue('experimental_backgroundPosition', 'left')).toEqual([
      { top: '50%', left: '0%' },
    ]);
  });

  // why: `repeat-x` is shorthand for two different per-axis values, so a passthrough of the raw
  // string cannot possibly be equivalent.
  it('expands a shorthand backgroundRepeat into its two axes', () => {
    expect(committedValue('experimental_backgroundRepeat', 'repeat-x')).toEqual(
      [{ x: 'repeat', y: 'no-repeat' }],
    );
  });

  // why: the guard against the whole family regressing to passthrough. A raw string in the payload
  // is the defect itself, whatever the parsed shape turns out to be.
  it.each([
    ['experimental_backgroundSize', '100px 200px'],
    ['experimental_backgroundPosition', 'left'],
    ['experimental_backgroundRepeat', 'repeat-x'],
  ])('never commits %s as the raw string', (key, css) => {
    expect(committedValue(key, css)).not.toBe(css);
  });

  // why: the control for refusal. RN refuses what it cannot parse, and a refusal must leave the
  // key ABSENT rather than commit an explicit undefined - the rule processor-undefined-is-absent
  // pins for the whole family.
  it('omits a backgroundSize RN refuses', () => {
    const committed = commitStyle({ experimental_backgroundSize: 'nonsense' });
    expect(Object.hasOwn(committed.props, 'experimental_backgroundSize')).toBe(
      false,
    );
  });
});
