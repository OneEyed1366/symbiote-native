// Co-located unit test: RN's babel preset in dev runs transform-react-jsx-self /
// -source, annotating every JSX element with __self (the component instance) and __source
// ({ fileName, lineNumber, columnNumber }). A JSX-based adapter carries them onto the vnode as
// ordinary props; routeProp must drop them so they never reach Fabric. __self carries a
// function, which crashed Android's folly::dynamic ("JS Functions are not convertible to
// dynamic").
//
// routeProp's REACT_JSX_DEV_PROPS branch is a plain early-return allow-list with no throwing
// path, so scenarios are grouped "stripped" vs "preserved" rather than Positive/Negative.

import { describe, expect, it } from 'vitest';
import { createElement, routeProp } from '../index';

describe('routeProp strips React JSX dev annotations (__self / __source)', () => {
  describe('stripped', () => {
    it('drops __source', () => {
      const node = createElement('RCTView');
      routeProp(node, '__source', {
        fileName: 'App.tsx',
        lineNumber: 66,
        columnNumber: 7,
      });
      expect('__source' in node.props).toBe(false);
    });

    // why: __self carries a function-valued instance ref; forwarding it to Fabric crashes
    // Android's folly::dynamic marshalling ("JS Functions are not convertible to dynamic").
    it('drops __self even though its value is a function (the crash trigger)', () => {
      const node = createElement('RCTView');
      routeProp(node, '__self', { someInstanceMethod: () => undefined });
      expect('__self' in node.props).toBe(false);
    });
  });

  describe('preserved (only the exact __self/__source names are stripped)', () => {
    // why: proves the strip is an exact-name allow-list, not a "double-underscore prefix"
    // heuristic — a real prop that merely resembles a dev annotation must still reach Fabric.
    it('keeps a prop that only resembles a dev annotation', () => {
      const node = createElement('RCTView');
      routeProp(node, '__customFlag', true);
      expect(node.props.__customFlag).toBe(true);
    });

    it('keeps a real prop set alongside a dropped dev annotation', () => {
      const node = createElement('RCTView');
      routeProp(node, '__source', {
        fileName: 'App.tsx',
        lineNumber: 66,
        columnNumber: 7,
      });
      routeProp(node, 'style', { flex: 1 });
      // style routes through the class/style merge (routeProp -> commitClassStyle), which stores
      // it as [classStyle, explicitStyle] — no class was set here, so the explicit half carries it.
      expect(node.props.style).toEqual([undefined, { flex: 1 }]);
    });

    // why: an onX prop routes to the listener map, not node.props, independent of a dev
    // annotation also being set on the same node — the strip must not interfere with that split.
    it('still routes a listener prop to listeners, not props, alongside a dropped dev annotation', () => {
      const node = createElement('RCTView');
      routeProp(node, '__self', { someInstanceMethod: () => undefined });
      const onRelease = (): void => {};
      routeProp(node, 'onResponderRelease', onRelease);
      expect('onResponderRelease' in node.props).toBe(false);
      expect(node.listeners?.has('responderRelease')).toBe(true);
    });
  });
});
