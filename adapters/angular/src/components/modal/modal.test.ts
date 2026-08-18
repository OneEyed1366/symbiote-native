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
  registerStyles,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Modal } from './index';

const ROOT_TAG = 912;
const fabric = installFabric();
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
      <symbiote-text>Hello</symbiote-text>
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
      <symbiote-text>Hello</symbiote-text>
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
    ><symbiote-text>Hi</symbiote-text></Modal
  >`,
})
class ModalHiddenHostFixture {}

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
  it('never commits a modal host node when it starts hidden', async () => {
    // why: shouldRenderModal(isVisible, state) gates on isVisible || state.isRendered; on the
    // FIRST render state.isRendered seeds from the same `visible` value (no keep-alive to fall
    // back on), so a modal that starts hidden contributes no node at all.
    mount(ROOT_TAG, ModalHiddenHostFixture);
    await tick();

    expect(fabric.find(n => n.props.testID === 'modal')).toBeUndefined();
  });

  it('unmounts the modal host node once a visible->hidden toggle settles', async () => {
    // why: the keep-alive exists so native's onDismiss can still arrive, not to keep the node
    // forever — after the queued reducer + a CD pass run, the hidden modal must actually be gone.
    mount(ROOT_TAG, ModalHostFixture);
    await tick();
    expect(fabric.find(n => n.props.testID === 'modal')).toBeDefined();

    if (!capturedHost) throw new Error('host was not captured');
    capturedHost.visible.set(false);
    await Promise.resolve();
    await tick();
    await tick();

    const stillThere = fabric.committed.some(function walk(node): boolean {
      if (node.props.testID === 'modal') return true;
      return node.children.some(walk);
    });
    expect(stillThere).toBe(false);
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
    registerStyles({ sheet: { backgroundColor: 'purple' } });

    mount(ROOT_TAG, ModalHostFixture);
    await tick();

    const node = fabric.find(n => n.props.testID === 'modal');
    expect(node?.props.backgroundColor).toBe('purple');
  });
});
