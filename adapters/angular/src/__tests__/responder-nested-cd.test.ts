// The device-faithful shape: a ROOT component whose template embeds a CHILD component that
// owns the responder state + the {{status}} binding (App -> ResponderDemo). Angular 20 compiles
// components as SignalView (not CheckAlways), so a plain (non-signal) state mutation inside a
// flat-bag responder callback does NOT dirty the child's reactive consumer, and the scheduler's
// root detectChanges() will NOT descend into it — the child's {{status}} used to stay stale
// ("pan does nothing"). SymbioteHostPropsDirective now refreshes its own host component's view
// right after the callback runs, so the nested child repaints.
//
// Coverage dictionary: this file exists specifically to close the ONE logical outcome
// responder-change-detection.test.ts structurally cannot reach — `markForCheck()` called on a
// directive whose injecting view is a NESTED component, not the root, proving the RefreshView
// flag actually survives the ancestor descent instead of only refreshing a flat root's own
// view. Every other branch of `SymbioteHostPropsDirective` (the setter loop, the non-function
// passthrough) is already closed by that sibling file; this file's coverage responsibility is
// narrowly the ancestor-marking behavior, not a full re-closure of the same unit.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost as View, TextHost as Text, SymbioteHostPropsDirective } from '../primitives';
import { registerComposedComponent } from '../anchor-host-registry';

const ROOT_TAG = 972;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';

registerComposedComponent('nested-responder-inner');

const fabric = installFabric();

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

function handleFor(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'nested-responder-inner',
  standalone: true,
  imports: [View, Text, SymbioteHostPropsDirective],
  template: `
    <View [symbioteHostProps]="handlers"></View>
    <Text [symbioteHostProps]="statusProps">{{ status }}</Text>
  `,
})
class NestedResponderInner {
  status = 'idle';
  statusProps = { testID: 'nested-status' };
  handlers = {
    testID: 'nested-chip',
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

@Component({
  selector: 'nested-responder-outer',
  standalone: true,
  imports: [View, NestedResponderInner],
  template: `
    <View>
      <nested-responder-inner></nested-responder-inner>
    </View>
  `,
})
class NestedResponderOuter {}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// No Negative group, same reason as responder-change-detection.test.ts: wrapCallback has no
// throwing path. This file's whole reason to exist alongside that flat-root sibling is the
// SignalView descent boundary the header comment names: markForCheck() must flag the CALLBACK
// OWNER'S ancestors (RefreshView survives descent), not just re-run the owner's own
// detectChanges() — a fix that worked for a flat root but only refreshed the directive's own
// injecting view without marking ancestors would leave `App -> child` nesting silently stale
// even though the flat-root sibling test stayed green. That's the real device shape
// (App -> ResponderDemo), so this is the one that actually proves the fix generalizes.
describe('Angular nested-child responder CD', () => {
  // why: see file header — a nested CHILD component's state, not the root's, must repaint after
  // its own flat-bag callback runs; the root's detectChanges() alone does not descend into a
  // SignalView child with no RefreshView flag.
  it('re-renders a nested child component`s state mutated in a flat-bag responder callback', async () => {
    mount(ROOT_TAG, NestedResponderOuter);
    await flush();
    expect(statusText('nested-status')).toBe('idle');

    const chip = handleFor('nested-chip');
    fabric.fireEvent(chip, TOUCH_START);
    await flush();
    expect(statusText('nested-status')).toBe('granted');

    fabric.fireEvent(chip, TOUCH_MOVE);
    await flush();
    expect(statusText('nested-status')).toBe('moving');

    fabric.fireEvent(chip, TOUCH_END);
    await flush();
    expect(statusText('nested-status')).toBe('released');
  });
});
