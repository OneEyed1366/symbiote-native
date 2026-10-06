import { useState } from 'react';
import { Modal, createPortal } from '@symbiote-native/react';
import type { IHostInstance } from '@symbiote-native/react';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';
import { overlayTunnel } from './canary-shared';

const COLOR = LINE_COLOR.primitives;

export function CanaryModal() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <ActionButton testID="modal-open" title="Open modal" onPress={() => setIsOpen(true)} color={COLOR} />
      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        {/* A transparent modal paints its own dim layer */}
        <view className="modal-overlay">
          <view testID="modal-card" className="modal-card">
            <text className="modal-title">It's a Modal</text>
            <text className="modal-body">
              Rendered through ModalHostView — its own native window, same Fabric tree.
            </text>
            <ActionButton testID="modal-close" title="Close" onPress={() => setIsOpen(false)} color={COLOR} />
          </view>
        </view>
      </Modal>
    </>
  );
}

// createPortal moves the card into the overlay host, a sibling of the scroll view
export function CanaryPortal({ host }: { host: IHostInstance | null }) {
  const [isShown, setIsShown] = useState(false);
  return (
    <>
      <ActionButton
        testID="toast-open"
        title="Show toast (createPortal)"
        onPress={() => setIsShown(true)}
        color={COLOR}
      />
      {isShown &&
        host &&
        createPortal(
          <view testID="toast-card" className="modal-card">
            <text className="modal-body">Ported via createPortal ✦</text>
            <ActionButton testID="toast-dismiss" title="Dismiss" onPress={() => setIsShown(false)} color={COLOR} />
          </view>,
          host,
        )}
    </>
  );
}

// createTunnel needs no ref or target: In registers its children, Out reads them back anywhere
export function CanaryTunnel() {
  const [isShown, setIsShown] = useState(false);
  return (
    <>
      <ActionButton
        testID="tunnel-toast-open"
        title="Show toast (createTunnel)"
        onPress={() => setIsShown(true)}
        color={COLOR}
      />
      {isShown && (
        <overlayTunnel.In>
          <view testID="tunnel-toast-card" className="modal-card">
            <text className="modal-body">Ported via createTunnel ✦</text>
            <ActionButton
              testID="tunnel-toast-dismiss"
              title="Dismiss"
              onPress={() => setIsShown(false)}
              color={COLOR}
            />
          </view>
        </overlayTunnel.In>
      )}
    </>
  );
}
