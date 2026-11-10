import { useEffect } from 'react';
import { FullWindowOverlay } from '@symbiote-native/navigation/react';
import { toastStore, useToast } from './use-toast';

const TOAST_MS = 2_500;

type IToastHostProps = { isOverlayModal: boolean };

type IToastBubbleProps = { text: string; className: string };

function ToastBubble({ text, className }: IToastBubbleProps) {
  return (
    <view className={className}>
      <text className="toast-text">{text}</text>
    </view>
  );
}

// Drawn by the screen below the modal, the overlay one rides in its own window above everything
export function ToastHost({ isOverlayModal }: IToastHostProps) {
  const toast = useToast();
  const toastId = toast?.id;
  useEffect(() => {
    if (toastId === undefined) return undefined;
    const timer = setTimeout(toastStore.hide, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toastId]);

  if (toast === null) return null;
  if (toast.kind === 'tree') {
    return (
      <ToastBubble
        className="toast toast-tree"
        text="Drawn by the screen below the modal"
      />
    );
  }
  return (
    <FullWindowOverlay
      unstable_accessibilityContainerViewIsModal={isOverlayModal}
    >
      <ToastBubble
        className="toast toast-overlay"
        text="Drawn in a FullWindowOverlay"
      />
    </FullWindowOverlay>
  );
}
