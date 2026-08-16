// The inset math itself (computeInset / resolveKeyboardAvoidingLayout, behavior ->
// style/structure) is framework-agnostic core logic (@symbiote-native/components,
// render-keyboard-avoiding-view.ts) shared verbatim with React/Vue — this file does not
// re-derive its edge cases. What is Angular-specific and exercised here: ngOnInit's Keyboard
// subscription driving markForCheck (the zoneless twin of React's setState / Vue's reactive
// ref), handleLayout measuring the wrapper frame before forwarding to the caller's onLayout,
// the `enabled === false` gate, and the anchor `class=` resolution (mirrors
// pressable.test.ts's "resolves a class=" case).
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { KeyboardAvoidingView } from './index';

const ROOT_TAG = 911;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

type IDeviceHub = { emit: (eventType: string, ...args: unknown[]) => void };

// ngOnInit subscribes to the Keyboard module, which installs the bridgeless device-event hub on
// first use (core/engine/src/native-events.ts). Capturing the hub — the same fake
// core/engine/src/keyboard/keyboard.test.ts uses — lets these tests play "native" and fire
// keyboardDidShow/keyboardDidHide, instead of stubbing the registration away as a no-op.
let deviceHub: IDeviceHub | undefined;
Object.assign(globalThis, {
  RN$registerCallableModule: (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  },
});

function emitKeyboardShow(screenY: number, height: number): void {
  deviceHub?.emit('keyboardDidShow', {
    duration: 250,
    easing: 'keyboard',
    endCoordinates: { screenX: 0, screenY, width: 390, height },
  });
}

function emitKeyboardHide(): void {
  deviceHub?.emit('keyboardDidHide', {});
}

// `fabric.find` only ever sees a node's FIRST-created props (createNode, never re-run on
// update); a prop that changes after mount — like paddingBottom growing on keyboardDidShow —
// only shows up on the current CLONE living in `fabric.committed`, so every lookup here walks
// the live committed tree instead.
function committedWrapper(testID: string): IFakeNode {
  const visit = (node: IFakeNode): IFakeNode | undefined => {
    if (node.props.testID === testID) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const node of fabric.committed) {
    const found = visit(node);
    if (found) return found;
  }
  throw new Error(`no wrapper with testID "${testID}" was committed`);
}

@Component({
  selector: 'symbiote-kav-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" behavior="padding" class="panel">
      <symbiote-text>Hello</symbiote-text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewHostFixture {}

@Component({
  selector: 'symbiote-kav-disabled-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" behavior="padding" [enabled]="false">
      <symbiote-text>Hello</symbiote-text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewDisabledHostFixture {}

beforeEach(() => {
  fabric.reset();
  deviceHub = undefined;
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

// why: contract-accurate group name — nothing here throws. ngOnInit's Keyboard subscription,
// the inset gate, and the anchor merge all resolve to a value or a no-op, never a rejection.
describe('KeyboardAvoidingView (no throwing path — see file header)', () => {
  it('measures its own frame, then pushes the wrapper down by the keyboard overlap on show, and clears it on hide', async () => {
    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();

    const before = committedWrapper('kav');
    fabric.fireEvent(before.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 100, width: 390, height: 500 },
    });
    await tick();

    // why: RN's inset is "how far the view must move so it no longer overlaps the keyboard" —
    // wrapper bottom edge (100 + 500 = 600) minus the keyboard's top edge (300) = 300.
    emitKeyboardShow(300, 346);
    await tick();
    expect(committedWrapper('kav').props.paddingBottom).toBe(300);

    emitKeyboardHide();
    await tick();
    expect(committedWrapper('kav').props.paddingBottom).toBe(0);
  });

  it('does not apply an inset when enabled is explicitly false', async () => {
    // why: source contract — "RN gates every inset on enabled ?? true; only an explicit false
    // disables" (index.ts's effectiveInset getter). Undefined/true must still avoid the keyboard.
    mount(ROOT_TAG, KeyboardAvoidingViewDisabledHostFixture);
    await tick();

    fabric.fireEvent(committedWrapper('kav').instanceHandle, 'topLayout', {
      layout: { x: 0, y: 100, width: 390, height: 500 },
    });
    await tick();
    emitKeyboardShow(300, 346);
    await tick();

    expect(committedWrapper('kav').props.paddingBottom).toBe(0);
  });

  it('resolves a class= on the KeyboardAvoidingView use site onto the real committed view, not the anchor', async () => {
    registerStyles({ panel: { backgroundColor: 'teal' } });

    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await tick();

    expect(committedWrapper('kav').props.backgroundColor).toBe('teal');
  });
});
