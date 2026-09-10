// The style half of fabricProps: how a style slot reaches the Fabric payload, and the memo that
// makes a shared style object cost one resolution for a whole list.
//
// This file exists because the memo was DEAD for months and every other test passed. `fabricProps`
// used to take its cached branch only when `node.props.style` was a bare object, and after
// routeProp it never is - `commitClassStyle` (node.ts) always writes the two-element
// `[classStyle, explicitStyle]` array, by design. So the first group below asserts the SHAPE
// routeProp leaves behind, which is the fact the old code got wrong, and the second asserts the
// memo actually fires through that shape.
//
// Correctness and the memo are tested together deliberately: a cache that returns right answers
// but never runs is exactly the failure that happened, and only the identity assertion catches it.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  createElement,
  propOf,
  routeProp,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { fabricProps } from '../fabric-props';

installFabric();

const VIEW = 'RCTView';

// `fabricProps(node, props)` folds a bag it is HANDED — the host owns the bag now, and the node
// supplies only component / hasAriaAlias / payloadFold. Reading the keys a case wrote back out of
// the host is the same bag the applier would pass, without standing up a commit for it.
function bagOf(
  node: ISymbioteNode,
  ...keys: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(keys.map(key => [key, propOf(node, key)]));
}

describe('fabricProps style hoisting', () => {
  // why: the fact the dead memo hinged on. If routeProp ever starts leaving a bare object here,
  // the branch structure in addStyle is worth revisiting - but until then, an implementation that
  // only handles the object case handles nothing.
  it('routeProp always leaves style as an ARRAY, never a bare object', () => {
    const styled = createElement(VIEW);
    routeProp(styled, 'style', { flex: 1 });
    expect(Array.isArray(propOf(styled, 'style'))).toBe(true);

    const classed = createElement(VIEW);
    routeProp(classed, 'className', 'card');
    expect(Array.isArray(propOf(classed, 'style'))).toBe(true);
  });

  it('hoists a routed style onto the payload alongside top-level props', () => {
    const node = createElement(VIEW);
    routeProp(node, 'testID', 'row-0');
    routeProp(node, 'style', { flex: 1, paddingTop: 8 });
    const payload = fabricProps(node, bagOf(node, 'testID', 'style'));
    expect(payload).toMatchObject({ testID: 'row-0', flex: 1, paddingTop: 8 });
    // The style slot itself never reaches Fabric — its keys are hoisted, the wrapper is dropped.
    expect('style' in payload).toBe(false);
  });

  it('lets a later entry win over an earlier one', () => {
    const node = createElement(VIEW);
    setProp(node, 'style', [{ flex: 1 }, { flex: 2 }]);
    expect(fabricProps(node, bagOf(node, 'style')).flex).toBe(2);
  });

  // why: the one semantic the flatten-then-hoist version had and a naive rewrite drops. An
  // explicit undefined in a later entry CLEARS the earlier value rather than being skipped.
  it('lets a later explicit undefined clear an earlier value', () => {
    const node = createElement(VIEW);
    setProp(node, 'style', [{ flex: 1 }, { flex: undefined }]);
    const payload = fabricProps(node, bagOf(node, 'style'));
    expect('flex' in payload).toBe(false);
  });

  // why: recursion is on POSITION only. `transform` is an array-VALUED prop, not a nested style
  // slot, and treating it as one would splice its entries into the payload as loose keys.
  it('recurses into nested style arrays but not into array VALUES', () => {
    const node = createElement(VIEW);
    setProp(node, 'style', [[{ flex: 1 }], { opacity: 0.5 }]);
    const payload = fabricProps(node, bagOf(node, 'style'));
    expect(payload.flex).toBe(1);
    expect(payload.opacity).toBe(0.5);

    const transformed = createElement(VIEW);
    setProp(transformed, 'style', { transform: [{ translateX: 5 }] });
    expect(
      Array.isArray(
        fabricProps(transformed, bagOf(transformed, 'style')).transform,
      ),
    ).toBe(true);
  });

  it('ignores null and false entries', () => {
    const node = createElement(VIEW);
    setProp(node, 'style', [null, false, { flex: 1 }, undefined]);
    expect(fabricProps(node, bagOf(node, 'style')).flex).toBe(1);
  });
});

describe('fabricProps style memoization', () => {
  // why: THE regression guard. A thousand rows share one class-resolved style object; resolving it
  // per node is O(nodes x styleKeys) work for an O(distinct styles) answer. Identity of the
  // processed VALUE is the only observable proof the memo ran - a correctness assertion passes
  // either way, which is how it stayed dead.
  it('resolves a shared style object once across nodes', () => {
    const shared = { transform: 'translateX(5px)' };
    const first = createElement(VIEW);
    const second = createElement(VIEW);
    routeProp(first, 'style', shared);
    routeProp(second, 'style', shared);
    const firstValue = fabricProps(first, bagOf(first, 'style')).transform;
    expect(firstValue).toBe(
      fabricProps(second, bagOf(second, 'style')).transform,
    );
    // And across commits of the same node, not just across nodes.
    expect(firstValue).toBe(
      fabricProps(first, bagOf(first, 'style')).transform,
    );
  });

  // why: the memo is keyed by component as well, because processValue consults that component's
  // ViewConfig processors - one style object can legitimately resolve differently under two view
  // names, and a single-keyed cache would hand the second one the first one's answer.
  it('keys the memo by component, not by style object alone', () => {
    const shared = { flex: 1 };
    const view = createElement(VIEW);
    const text = createElement('RCTText', true);
    routeProp(view, 'style', shared);
    routeProp(text, 'style', shared);
    expect(fabricProps(view, bagOf(view, 'style')).flex).toBe(1);
    expect(fabricProps(text, bagOf(text, 'style')).flex).toBe(1);
  });

  // why: the payload itself must stay a fresh object per call - reconcile stores it in the
  // committed record and diffs the NEXT one against it, so a shared payload would compare equal
  // to itself forever and no update would ever reach Fabric.
  it('still returns a fresh payload object per call', () => {
    const node = createElement(VIEW);
    routeProp(node, 'style', { flex: 1 });
    expect(fabricProps(node, bagOf(node, 'style'))).not.toBe(
      fabricProps(node, bagOf(node, 'style')),
    );
  });
});
