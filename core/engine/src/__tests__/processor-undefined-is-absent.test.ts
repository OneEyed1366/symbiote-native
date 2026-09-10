// A style processor that refuses its input answers `undefined`, and the committed payload must
// then carry NO key - not a key whose value is undefined.
//
// The distinction is invisible headless until you look for it: every payload assertion in this
// repo reads by VALUE, and `props.transformOrigin` is undefined whether the key was assigned or
// never written. It is not invisible to Fabric, which receives an explicit undefined for a prop
// the app never set.
//
// WRITTEN THROUGH `style`, which is the only path that exists. The structured keys are resolved on
// the way IN (node.ts:517 -> structured-style.ts) and only for `style`/`activeStyle`, because the
// C++ payload builder has no JS: a value resolved at payload-build time is resolved headless only.
// An earlier version of this file wrote `transformOrigin` as a TOP-LEVEL prop and read the builder
// directly; both were artifacts of the pre-buffer engine, where fabric-props hoisted style keys and
// processed them afterwards.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { createElement, createSurface, routeProp } from '../index';

const fabric = installFabric();
let nextRootTag = 8600;

function commitStyle(style: Record<string, unknown>) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  routeProp(node, 'style', style);
  surface.appendChild(node);
  surface.commit();
  return fabric.appRoot().children[0];
}

describe('a processor that writes nothing leaves the key ABSENT', () => {
  // why: `transformOrigin: null` is what an app writes for "no origin". It used to commit a real
  // centre origin; it must commit no transformOrigin at all.
  it('omits transformOrigin when the value is not an origin', () => {
    const committed = commitStyle({ transformOrigin: null });
    expect(Object.hasOwn(committed.props, 'transformOrigin')).toBe(false);
  });

  // why: an origin RN refuses (a horizontal keyword in the y slot) must not reach the payload as
  // an explicit undefined either.
  it('omits transformOrigin when RN refuses the string', () => {
    const committed = commitStyle({ transformOrigin: '50% left' });
    expect(Object.hasOwn(committed.props, 'transformOrigin')).toBe(false);
  });

  // why: the same gap through a different processor - proof this is a rule about refusal and not
  // one processor's quirk. RN drops a malformed ratio too.
  it('omits aspectRatio when the ratio is malformed', () => {
    const committed = commitStyle({ aspectRatio: '1/2/3' });
    expect(Object.hasOwn(committed.props, 'aspectRatio')).toBe(false);
  });

  // why: the control. Without it, a probe that matched nothing would report the same green.
  it('still writes a valid origin', () => {
    const committed = commitStyle({ transformOrigin: 'left top' });
    expect(committed.props.transformOrigin).toEqual([0, 0, 0]);
  });
});
