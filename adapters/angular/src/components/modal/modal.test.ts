// The style math (backdrop override, container/host styles, presentationStyle default) and the
// iOS keep-alive reducer (createInitialModalState/modalReducer/shouldRenderModal) are
// framework-agnostic core logic (@symbiote-native/components) shared verbatim with React/Vue —
// this file does not re-derive their edge cases. What is Angular-specific and exercised here:
// ngOnInit seeding the keep-alive state from the FIRST visible value, ngOnChanges queuing the
// reducer on a microtask so a visible→hidden toggle survives one more committed frame instead of
// unmounting in the same CD pass, and the anchor `class=` resolution (mirrors
// pressable.test.ts's "resolves a class=" case).
import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  parentOf,
  registerRules,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Modal } from './index';

const ROOT_TAG = 912;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: ModalHostFixture | undefined;
let capturedOrientationHost: ModalOrientationHostFixture | undefined;

@Component({
  selector: 'symbiote-modal-host',
  standalone: true,
  imports: [Modal],
  template: `
    <Modal [visible]="visible()" [testID]="'modal'" class="sheet">
      <text>Hello</text>
    </Modal>
  `,
})
class ModalHostFixture {
  readonly visible = signal(true);
  constructor() {
    // Captures the live component instance so the test can drive its signal after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

@Component({
  selector: 'symbiote-modal-orientation-host',
  standalone: true,
  imports: [Modal],
  template: `
    <Modal
      [visible]="true"
      [testID]="'modal'"
      (orientationChange)="received = $event"
    >
      <text>Hello</text>
    </Modal>
  `,
})
class ModalOrientationHostFixture {
  received?: ISymbioteEvent;
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedOrientationHost = this;
  }
}

@Component({
  selector: 'symbiote-modal-hidden-host',
  standalone: true,
  imports: [Modal],
  template: `<Modal [visible]="false" [testID]="'modal'"
    ><text>Hi</text></Modal
  >`,
})
class ModalHiddenHostFixture {}

@Component({
  selector: 'symbiote-modal-default-host',
  standalone: true,
  imports: [Modal],
  template: `<Modal [testID]="'modal'"><text>Hi</text></Modal>`,
})
class ModalDefaultVisibleHostFixture {}

beforeEach(() => {
  capturedHost = undefined;
  capturedOrientationHost = undefined;
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

// why: contract-accurate group name — nothing here throws. A hidden modal renders no node
// instead of raising an error, and every toggle resolves to a committed value, never a rejection.
describe('Modal (no throwing path — see file header)', () => {
  // why: Modal.js `defaultProps.visible = true` — a `<Modal>` without `visible` shows.
  it('shows a modal written without visible, as RN defaults it', async () => {
    mount(ROOT_TAG, ModalDefaultVisibleHostFixture);
    await tick();

    const modal = fabric.find(n => n.props.testID === 'modal');
    expect(modal).toBeDefined();
    if (modal === undefined) return;
    expect(payloadOf(modal.handle).visible).toBe(true);
  });

  it('never commits a modal host node when it starts hidden', async () => {
    // why: shouldRenderModal(isVisible, state) gates on isVisible || state.isRendered; on the
    // FIRST render state.isRendered seeds from the same `visible` value (no keep-alive to fall
    // back on), so a modal that starts hidden contributes no node at all.
    mount(ROOT_TAG, ModalHiddenHostFixture);
    await tick();

    expect(fabric.find(n => n.props.testID === 'modal')).toBeUndefined();
  });

  it('holds the modal host through the hide and unmounts it on the native dismiss', async () => {
    // why: Modal.js (iOS) drops the keep-alive ONLY in its onDismiss handler — the node stays
    // mounted through the native exit animation, then goes.
    mount(ROOT_TAG, ModalHostFixture);
    await tick();
    const modal = fabric.find(n => n.props.testID === 'modal');
    expect(modal).toBeDefined();
    if (modal === undefined) return;

    if (!capturedHost) throw new Error('host was not captured');
    capturedHost.visible.set(false);
    await Promise.resolve();
    await tick();
    await tick();

    // The recording host never forgets a node it once saw created, so residency is read off the
    // engine's own live parent link — undefined once the node is actually detached — not off a
    // search over the creation log, which would report this node resident forever.
    expect(parentOf(modal.handle), 'held for the exit animation').toBeDefined();

    fabric.fireEvent(modal.instanceHandle, 'topDismiss', {});
    await Promise.resolve();
    await tick();
    await tick();
    expect(parentOf(modal.handle)).toBeUndefined();
  });

  it('emits the raw ISymbioteEvent on orientationChange, orientation on nativeEvent', async () => {
    // why: orientationChange is the only Modal event carrying a payload, and Angular reaches it
    // through the same Renderer2 listener every other adapter uses — the engine delivers the
    // ISymbioteEvent wrapper, so the @Output must forward that verbatim rather than promise a bare
    // { orientation } a subscriber would find empty.
    mount(ROOT_TAG, ModalOrientationHostFixture);
    await tick();

    const node = fabric.find(n => n.props.testID === 'modal');
    if (!node) throw new Error('no modal host node was created');
    fabric.fireEvent(node.instanceHandle, 'topOrientationChange', {
      orientation: 'landscape',
    });

    expect(capturedOrientationHost?.received?.type).toBe('orientationChange');
    expect(capturedOrientationHost?.received?.nativeEvent.orientation).toBe(
      'landscape',
    );
  });

  it('resolves a class= on the Modal use site onto the real committed view, not the anchor', async () => {
    registerRules([
      {
        tokens: ['sheet'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'purple' },
      },
    ]);

    mount(ROOT_TAG, ModalHostFixture);
    await tick();

    const node = fabric.find(n => n.props.testID === 'modal');
    expect(node && payloadOf(node.handle).backgroundColor).toBe('purple');
  });
});
