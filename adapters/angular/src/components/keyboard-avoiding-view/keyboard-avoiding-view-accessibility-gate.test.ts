// Regression coverage for the eager accessibility-gate binding
// (`.claude/rules/fabric-boolean-event-gates.md`). Before this, the template bound the four
// accessibility events unconditionally on the wrapper <symbiote-view>, so every KeyboardAvoidingView
// lit all four gate flags whether or not an app ever subscribed. `layout` is DELIBERATELY excluded
// from this fix and stays unconditional — the component reads its own onLayout internally
// (handleLayout feeds the inset fixpoint math), so gating it on `.observed` would silently break
// keyboard-following the moment an app doesn't listen to the `layout` @Output().
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { KeyboardAvoidingView } from './index';

const ROOT_TAG = 917;
const fabric = installFabric();

// ngOnInit subscribes to the Keyboard module unconditionally, which requires a bridgeless native
// event hub to be present (core/engine/src/native-events.ts) — same minimal fake
// keyboard-avoiding-view.test.ts installs, trimmed to just what mounting needs.
Object.assign(globalThis, {
  RN$registerCallableModule: (): void => {},
});

@Component({
  selector: 'symbiote-kav-gate-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" behavior="padding">
      <symbiote-text>Hello</symbiote-text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewNoSubscriberFixture {}

@Component({
  selector: 'symbiote-kav-gate-subscribed-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView
      [testID]="'kav'"
      behavior="padding"
      (accessibilityAction)="onAction($event)"
    >
      <symbiote-text>Hello</symbiote-text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewOneSubscriberFixture {
  onAction(): void {}
}

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

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('KeyboardAvoidingView accessibility gate', () => {
  it('lights no accessibility gate flag with no subscriber, but keeps onLayout lit', async () => {
    mount(ROOT_TAG, KeyboardAvoidingViewNoSubscriberFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const props = committedNode('kav')?.props;
    expect(props?.onLayout).toBe(true);
    expect(props?.onAccessibilityAction ?? null).toBeNull();
    expect(props?.onAccessibilityTap ?? null).toBeNull();
    expect(props?.onMagicTap ?? null).toBeNull();
    expect(props?.onAccessibilityEscape ?? null).toBeNull();
  });

  it('lights only the subscribed gate flag', async () => {
    mount(ROOT_TAG, KeyboardAvoidingViewOneSubscriberFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const props = committedNode('kav')?.props;
    expect(props?.onAccessibilityAction).toBe(true);
    expect(props?.onLayout).toBe(true);
    expect(props?.onAccessibilityTap ?? null).toBeNull();
    expect(props?.onMagicTap ?? null).toBeNull();
    expect(props?.onAccessibilityEscape ?? null).toBeNull();
  });
});
