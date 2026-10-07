import { createSignal } from 'solid-js';
import { Modal } from '@symbiote-native/solid';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';

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
              Rendered through ModalHostView — its own native window, same Fabric tree.
            </text>
            <ActionButton testID="modal-close" title="Close" onPress={() => setIsOpen(false)} color={COLOR} />
          </view>
        </view>
      </Modal>
    </>
  );
}
