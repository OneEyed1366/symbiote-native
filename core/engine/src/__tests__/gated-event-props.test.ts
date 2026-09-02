// The contract GATED_EVENT_PROPS (core/engine/src/node.ts) exists for is not "the node carries a
// flag" — it is "the flag reaches Fabric". Six events are emitted by the native side only behind
// `if (props.onX)`; fabricProps drops every function prop, so a handler with no flag in the
// COMMITTED payload is dead on device while the listener map looks perfectly wired.
//
// node.test.ts asserts the flag lands on node.props. That is the wrong end of the chain to trust:
// it would stay green if fabricProps ever started dropping booleans too. This file asserts the
// committed payload, which is what native actually reads, and it is the assertion that would have
// caught the five gates the engine shipped without (onTextLayout + the four accessibility ones).
import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  createElement,
  createSurface,
  routeProp,
  setEventListener,
  type ISymbioteNode,
} from '../index';

const fabric = installFabric();

// [event name after listenerName, payload key, the view the gate belongs to]
const GATES: ReadonlyArray<readonly [string, string, string]> = [
  ['layout', 'onLayout', 'RCTView'],
  ['accessibilityTap', 'onAccessibilityTap', 'RCTView'],
  ['magicTap', 'onMagicTap', 'RCTView'],
  ['accessibilityEscape', 'onAccessibilityEscape', 'RCTView'],
  ['accessibilityAction', 'onAccessibilityAction', 'RCTView'],
  ['textLayout', 'onTextLayout', 'RCTText'],
];

let nextRootTag = 7300;

function commitOne(build: (node: ISymbioteNode) => void, view: string) {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement(view);
  build(node);
  surface.appendChild(node);
  surface.commit();
  return { surface, committed: fabric.appRoot().children[0] };
}

// The gate is a payload fact, and there is no input that makes raising one throw — an unknown
// event simply raises nothing. So the groups below are named for the outcome they prove rather
// than Positive/Negative.
describe('Fabric boolean event gates reach the committed payload', () => {
  it.each(GATES)(
    'a "%s" listener commits %s: true',
    (event, flagProp, view) => {
      const { committed } = commitOne(
        node => setEventListener(node, event, () => {}),
        view,
      );

      expect(committed.props[flagProp]).toBe(true);
    },
  );

  // why: an adapter passing the handler as a flat prop (React's JSX bag, Vue's props, Solid's
  // renderer) never calls setEventListener itself — it goes through routeProp, which must reach
  // the same flag. The gate table is consulted BEFORE the ViewConfig precisely so this holds on a
  // component whose config does not declare the event.
  it.each(GATES)(
    'routeProp commits %s -> %s from a flat prop bag',
    (event, flagProp, view) => {
      const propName = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;

      const { committed } = commitOne(
        node => routeProp(node, propName, () => {}),
        view,
      );

      expect(committed.props[flagProp]).toBe(true);
    },
  );

  // why: Fabric spells "back to the default" as an explicit null on a clone, never as an absent
  // key. Removing the last listener must therefore commit `null`, not leave the flag at `true` —
  // otherwise native keeps emitting an event nobody handles for the rest of the node's life.
  it.each(GATES)(
    'clearing a "%s" listener commits %s back to the default',
    (event, flagProp, view) => {
      const surface = createSurface((nextRootTag += 1));
      const node = createElement(view);
      setEventListener(node, event, () => {});
      surface.appendChild(node);
      surface.commit();
      expect(fabric.appRoot().children[0].props[flagProp]).toBe(true);

      setEventListener(node, event, undefined);
      surface.commit();

      expect(fabric.appRoot().children[0].props[flagProp] ?? null).toBeNull();
    },
  );

  // why: the flag is the ONLY on* key the payload should ever carry. Every other event handler is
  // a JS-side concern — sending it would put a dead prop on every node in the tree, which is the
  // bulk of why stock RN's payload is nearly twice ours on the same benchmark row.
  it('commits no on* key for an ungated event', () => {
    const { committed } = commitOne(node => {
      setEventListener(node, 'press', () => {});
      setEventListener(node, 'change', () => {});
      setEventListener(node, 'scroll', () => {});
    }, 'RCTView');

    expect(
      Object.keys(committed.props).filter(key => key.startsWith('on')),
    ).toEqual([]);
  });
});
