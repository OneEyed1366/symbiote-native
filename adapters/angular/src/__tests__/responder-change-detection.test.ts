// A flat-bag `onX` responder callback is invoked by the engine's event dispatch, entirely
// outside Angular. In Angular 20 components compile as SignalView (not CheckAlways), so a plain
// state mutation inside such a callback dirties nothing and the template stays stale — the "pan
// does nothing" bug, while React/Vue repainted the same demo. SymbioteHostPropsDirective now
// calls `cdr.markForCheck()` after each such callback (flags the component + ancestors with
// RefreshView and notifies the scheduler), so the mutation repaints. This is the flat-root case;
// responder-nested-cd.test.ts covers the App→child nesting the real app has.
//
// Coverage dictionary (SymbioteHostPropsDirective, adapters/angular/src/primitives/shared.ts):
//   symbioteHostProps setter (Object.entries iteration + Renderer2.setProperty per key) —
//     covered (every assertion here depends on `handlers`/`statusProps` actually landing on the
//     host nodes).
//   wrapCallback — function-prop branch (wrap + markForCheck): covered, the whole point of this
//     file, driven three times to prove repeated re-arming, not just a first-fire fix. Non-
//     function/non-`onX`-prefixed branch (pass through untouched): covered explicitly below —
//     asserts `testID` lands as the plain string it was, not a wrapped function, since a
//     regression here would break `handleFor`/`statusText` silently rather than throwing (a
//     function value serialized into `IFakeNode.props` would just fail the equality check, not
//     crash), so it is worth asserting directly instead of only relying on the other assertions
//     "would have broken" as indirect proof.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost as View, TextHost as Text, SymbioteHostPropsDirective } from '../primitives';

const ROOT_TAG = 970;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();

// Fabric is clone-on-write: a prop update yields a NEW node object in the committed tree,
// never in `created`. Walk the live committed child-set for post-mutation assertions.
function findCommitted(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined {
  const stack = [...fabric.committed];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (predicate(node)) return node;
    stack.push(...node.children);
  }
  return undefined;
}

function statusText(testID: string): string | undefined {
  const node = findCommitted(n => n.props.testID === testID);
  const raw = node?.children[0];
  return typeof raw?.props.text === 'string' ? raw.props.text : undefined;
}

// The stable SymbioteNode (event target). Its identity and listener map survive clone-on-
// write, so firing on the first-created handle reaches the live listeners.
function handleFor(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-responder-cd-host',
  standalone: true,
  imports: [View, Text, SymbioteHostPropsDirective],
  template: `
    <View [symbioteHostProps]="handlers"></View>
    <Text [symbioteHostProps]="statusProps">{{ status }}</Text>
  `,
})
class ResponderCdHost {
  status = 'idle';
  statusProps = { testID: 'status' };
  handlers = {
    testID: 'chip',
    onStartShouldSetResponder: () => true,
    onResponderGrant: () => {
      this.status = 'granted';
    },
    onResponderMove: () => {
      this.status = 'moving';
    },
    onResponderRelease: () => {
      this.status = 'released';
    },
  };
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// No Negative group: SymbioteHostPropsDirective's wrapCallback (adapters/angular/src/primitives/
// shared.ts) has no throwing path — a non-function prop (testID) passes through untouched, a
// function prop gets wrapped. There is nothing here that should be REJECTED, only a mutation
// that must (Positive) or must not repaint. This single scenario is Positive: it proves the
// zoneless "pan does nothing" bug (file header) stays fixed by driving the SAME callback three
// times in sequence and asserting the template re-renders after EACH one, not just the first —
// a fix that only refreshed once (e.g. a CD flag that gets consumed and not re-armed) would
// pass a single-fire assertion but fail this one.
describe('Angular responder callback triggers change detection', () => {
  // why: markForCheck() must fire on every flat-bag onX callback invocation, not just the
  // first, or the second/third responder-phase transition (grant -> move -> release) would
  // silently stop repainting after the initial fix "used up" its one refresh.
  it('re-renders bound state mutated inside a flat-bag responder callback', async () => {
    mount(ROOT_TAG, ResponderCdHost);
    await flush();
    expect(statusText('status')).toBe('idle');

    const chip = handleFor('chip');
    // why: wrapCallback's OTHER branch — a non-function, non-`onX` prop bundled into the same
    // `symbioteHostProps` bag must reach the host UNCHANGED, not get wrapped into a function
    // that also fires `markForCheck()`. `chip`/`handleFor` themselves only resolve at all
    // because this already held (`fabric.find` matches `props.testID === 'chip'`, a string),
    // which makes it an indirect proof; asserting the committed node's prop value directly
    // closes the branch without relying on that.
    const chipNode = fabric.find(n => n.instanceHandle === chip);
    expect(chipNode?.props.testID).toBe('chip');

    fabric.fireEvent(chip, TOUCH_START);
    await flush();
    expect(statusText('status')).toBe('granted');

    fabric.fireEvent(chip, TOUCH_MOVE);
    await flush();
    expect(statusText('status')).toBe('moving');

    fabric.fireEvent(chip, TOUCH_END);
    await flush();
    expect(statusText('status')).toBe('released');
  });
});
