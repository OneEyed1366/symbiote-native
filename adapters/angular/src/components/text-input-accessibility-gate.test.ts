// Regression coverage for the eager accessibility-gate binding on TextInput
// (`.claude/rules/fabric-boolean-event-gates.md`).
//
// Both of its template branches — single-line and multiline — bound the four gated accessibility
// events on the bare host tag, unconditionally, which is what a template binding IS. So every
// TextInput in every app committed all four flags and native fired accessibility events into
// handlers that re-emitted into nothing. `tsc` green, whole suite green, device-only.
//
// Worth stating because a project rule listed this component among the FIXED ones for a day: the
// per-component pass that closed seven of these did not reach it. The code was the deciding side.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { TextInput } from './text-input';

const ROOT_TAG = 980;
const fabric = installFabric();

const GATE_KEYS = [
  'onAccessibilityAction',
  'onAccessibilityTap',
  'onMagicTap',
  'onAccessibilityEscape',
] as const;

@Component({
  selector: 'text-input-gate-quiet',
  standalone: true,
  imports: [TextInput],
  template: `<TextInput [testID]="'field'"></TextInput>`,
})
class QuietFixture {}

@Component({
  selector: 'text-input-gate-subscribed',
  standalone: true,
  imports: [TextInput],
  template: `<TextInput
    [testID]="'field'"
    (accessibilityEscape)="onEscape()"
  ></TextInput>`,
})
class SubscribedFixture {
  onEscape(): void {}
}

// why: `multiline` picks a DIFFERENT host tag, and the bindings were duplicated per branch — so a
// fix applied to one branch and not the other is exactly the shape this component invites.
@Component({
  selector: 'text-input-gate-multiline',
  standalone: true,
  imports: [TextInput],
  template: `<TextInput [testID]="'field'" [multiline]="true"></TextInput>`,
})
class MultilineQuietFixture {}

function committedNode(testID: string): IFakeNode | undefined {
  const visit = (node: IFakeNode): IFakeNode | undefined => {
    if (node.props.testID === testID) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const found = visit(root);
    if (found) return found;
  }
  return undefined;
}

function litGates(testID: string): string[] {
  const props = committedNode(testID)?.props;
  if (props === undefined) return [];
  return GATE_KEYS.filter(key => (props[key] ?? null) !== null);
}

const settle = (): Promise<void> =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('TextInput accessibility gate', () => {
  describe('Positive', () => {
    // why: the control. The two negative rows below are both satisfied by a tree that never
    // mounted, so something has to be shown to light first.
    it('lights exactly the subscribed gate', async () => {
      mount(ROOT_TAG, SubscribedFixture);
      await settle();

      expect(litGates('field')).toEqual(['onAccessibilityEscape']);
    });
  });

  describe('Negative', () => {
    it('lights nothing with no subscriber', async () => {
      mount(ROOT_TAG, QuietFixture);
      await settle();

      expect(litGates('field')).toEqual([]);
    });

    it('lights nothing on the multiline host either', async () => {
      mount(ROOT_TAG, MultilineQuietFixture);
      await settle();

      expect(litGates('field')).toEqual([]);
    });
  });
});
