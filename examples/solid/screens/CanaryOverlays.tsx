import { Show, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import { Modal, Portal } from '@symbiote-native/solid';
import type { IHostInstance } from '@symbiote-native/solid';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';
import { overlayTunnel } from './canary-shared';

const COLOR = LINE_COLOR.primitives;

export function CanaryModal() {
  const [isOpen, setIsOpen] = createSignal(false);
  return (
    <>
      <ActionButton testID="modal-open" title="Open modal" onPress={() => setIsOpen(true)} color={COLOR} />
      <Modal visible={isOpen()} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        {/* A transparent modal paints its own dim layer */}
        <view class="modal-overlay">
          <view testID="modal-card" class="modal-card">
            <text class="modal-title">It's a Modal</text>
            <text class="modal-body">
              Rendered through ModalHostView, its own native window, same Fabric tree.
            </text>
            <ActionButton testID="modal-close" title="Close" onPress={() => setIsOpen(false)} color={COLOR} />
          </view>
        </view>
      </Modal>
    </>
  );
}

// `Portal` moves the card into the overlay host, a sibling of the scroll view
export function CanaryPortal(props: { host: IHostInstance | undefined }) {
  const [isShown, setIsShown] = createSignal(false);
  return (
    <>
      <ActionButton
        testID="toast-open"
        title="Show toast (Portal)"
        onPress={() => setIsShown(true)}
        color={COLOR}
      />
      <Show when={isShown() && props.host}>
        {(mount: Accessor<IHostInstance>) => (
          <Portal mount={mount()}>
            <view testID="toast-card" class="modal-card">
              <text class="modal-body">Ported via Portal ✦</text>
              <ActionButton testID="toast-dismiss" title="Dismiss" onPress={() => setIsShown(false)} color={COLOR} />
            </view>
          </Portal>
        )}
      </Show>
    </>
  );
}

// `createTunnel` needs no ref or target, `In` registers its children and `Out` reads them anywhere
export function CanaryTunnel() {
  const [isShown, setIsShown] = createSignal(false);
  return (
    <>
      <ActionButton
        testID="tunnel-toast-open"
        title="Show toast (createTunnel)"
        onPress={() => setIsShown(true)}
        color={COLOR}
      />
      <Show when={isShown()}>
        <overlayTunnel.In>
          <view testID="tunnel-toast-card" class="modal-card">
            <text class="modal-body">Ported via createTunnel ✦</text>
            <ActionButton
              testID="tunnel-toast-dismiss"
              title="Dismiss"
              onPress={() => setIsShown(false)}
              color={COLOR}
            />
          </view>
        </overlayTunnel.In>
      </Show>
    </>
  );
}
