// `experimental_background{Size,Position,Repeat}` are three of the eleven style keys RN parses in
// JS before native. STYLE_PROCESSORS carried the fourth (`experimental_backgroundImage`) and not
// these, so a CSS string for any of them reached Fabric as a raw string.
//
// That is the exact shape of the process-transform incident: Fabric's C++ expects the parsed
// structure, a string is not it, and nothing throws - the declaration is silently dropped (iOS) or
// cast to the wrong native type (Android). Invisible to every existing assertion, because none of
// them reads these three keys at all.
//
// The expectations below come from reading RN's own parsers, not from our output. Two of them are
// worth stating out loud because they look like typos and are not:
//   - `getValidLengthPercentageSizeOrNull` (processBackgroundSize.js:75) accepts only px, % and
//     `auto`, so a single length yields `y: 'auto'`.
//   - a bare `left` is a POSITION keyword pair, not a single axis: `{top: '50%', left: '0%'}`.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { createElement, routeProp } from '@symbiote-native/engine';
import { fabricProps } from '../fabric-props';

installFabric();

const VIEW = 'RCTView';

function commit(key: string, value: unknown): unknown {
  const node = createElement(VIEW);
  routeProp(node, key, value);
  return fabricProps(node)[key];
}

describe('the background longhands reach Fabric parsed, never as a CSS string', () => {
  // why: two lengths are the unambiguous form - both axes explicit, no defaulting to argue about.
  it('parses a two-length backgroundSize', () => {
    expect(commit('experimental_backgroundSize', '100px 200px')).toEqual([
      { x: 100, y: 200 },
    ]);
  });

  // why: one length means the other axis is auto. This is the rule an app hits by default, and
  // the one a hand-port would most likely get wrong.
  it('defaults the second axis of a one-length backgroundSize to auto', () => {
    expect(commit('experimental_backgroundSize', '50%')).toEqual([
      { x: '50%', y: 'auto' },
    ]);
  });

  // why: a keyword position is a PAIR - RN resolves the unnamed axis to the centre rather than
  // leaving it absent, so the payload must carry both.
  it('resolves a keyword backgroundPosition to both axes', () => {
    expect(commit('experimental_backgroundPosition', 'left')).toEqual([
      { top: '50%', left: '0%' },
    ]);
  });

  // why: `repeat-x` is shorthand for two different per-axis values, so a passthrough of the raw
  // string cannot possibly be equivalent.
  it('expands a shorthand backgroundRepeat into its two axes', () => {
    expect(commit('experimental_backgroundRepeat', 'repeat-x')).toEqual([
      { x: 'repeat', y: 'no-repeat' },
    ]);
  });

  // why: the guard against the whole family regressing to passthrough. A raw string in the payload
  // is the defect itself, whatever the parsed shape turns out to be.
  it.each([
    ['experimental_backgroundSize', '100px 200px'],
    ['experimental_backgroundPosition', 'left'],
    ['experimental_backgroundRepeat', 'repeat-x'],
  ])('never commits %s as the raw string', (key, css) => {
    expect(commit(key, css)).not.toBe(css);
  });

  // why: the control. RN refuses what it cannot parse, and a refusal must leave the key ABSENT
  // rather than commit an explicit undefined - the rule processor-undefined-is-absent pins.
  it('omits a backgroundSize RN refuses', () => {
    const node = createElement(VIEW);
    routeProp(node, 'experimental_backgroundSize', 'nonsense');
    expect(Object.keys(fabricProps(node))).not.toContain(
      'experimental_backgroundSize',
    );
  });
});
