// A style processor that refuses its input answers `undefined`, and the payload must then carry
// NO key - not a key whose value is undefined.
//
// The distinction is invisible headless until you look for it: `Object.keys` reports the key
// either way only if it was assigned, and every assertion in this repo that reads a payload reads
// it by value. It is not invisible to Fabric, which receives an explicit undefined for a prop the
// app never set.
//
// fabricProps skips an undefined INPUT (`if (value === undefined) continue`) and has always
// written the RESULT unconditionally, so this gap belongs to every refusing processor, not just
// the two exercised here.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { createElement, routeProp } from '@symbiote-native/engine';
import { fabricProps } from '../fabric-props';

installFabric();

const VIEW = 'RCTView';

describe('a processor that writes nothing leaves the key ABSENT', () => {
  // why: `transformOrigin: null` is what an app writes for "no origin". It used to commit a real
  // center origin; it must now commit no transformOrigin at all.
  it('omits transformOrigin when the value is not an origin', () => {
    const node = createElement(VIEW);
    routeProp(node, 'transformOrigin', null);
    expect(Object.keys(fabricProps(node))).not.toContain('transformOrigin');
  });

  // why: an origin RN refuses (a horizontal keyword in the y slot) must not reach the payload as
  // an explicit undefined either.
  it('omits transformOrigin when RN refuses the string', () => {
    const node = createElement(VIEW);
    routeProp(node, 'transformOrigin', '50% left');
    expect(Object.keys(fabricProps(node))).not.toContain('transformOrigin');
  });

  // why: the same gap, reached through a different processor - proof this is fabricProps' rule
  // and not one processor's quirk. RN drops a malformed ratio too.
  it('omits aspectRatio when the ratio is malformed', () => {
    const node = createElement(VIEW);
    routeProp(node, 'aspectRatio', '1/2/3');
    expect(Object.keys(fabricProps(node))).not.toContain('aspectRatio');
  });

  // why: the control. Without it, a probe that matched nothing would report the same green.
  it('still writes a valid origin', () => {
    const node = createElement(VIEW);
    routeProp(node, 'transformOrigin', 'left top');
    expect(fabricProps(node).transformOrigin).toEqual([0, 0, 0]);
  });
});
