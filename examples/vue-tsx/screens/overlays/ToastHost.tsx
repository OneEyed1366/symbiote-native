import { computed, defineComponent, watchEffect } from 'vue';
import { FullWindowOverlay } from '@symbiote-native/navigation/vue';
import { toastStore, useToast } from './use-toast';

const TOAST_MS = 2_500;

type IToastBubbleProps = { text: string; bubbleClass: string };

function ToastBubble(props: IToastBubbleProps) {
  return (
    <view class={props.bubbleClass}>
      <text class="toast-text">{props.text}</text>
    </view>
  );
}

// Drawn by the screen below the modal, the overlay one rides in its own window above everything
export const ToastHost = defineComponent(
  (props: { isOverlayModal: boolean }) => {
    const toast = useToast();
    const toastId = computed(() => toast.value?.id);
    watchEffect(onCleanup => {
      if (toastId.value === undefined) return;
      const timer = setTimeout(toastStore.hide, TOAST_MS);
      onCleanup(() => clearTimeout(timer));
    });

    return () => {
      const current = toast.value;
      if (current === null) return null;
      if (current.kind === 'tree') {
        return (
          <ToastBubble
            bubbleClass="toast toast-tree"
            text="Drawn by the screen below the modal"
          />
        );
      }
      return (
        <FullWindowOverlay
          unstable_accessibilityContainerViewIsModal={props.isOverlayModal}
        >
          <ToastBubble
            bubbleClass="toast toast-overlay"
            text="Drawn in a FullWindowOverlay"
          />
        </FullWindowOverlay>
      );
    };
  },
  { name: 'ToastHost', props: ['isOverlayModal'] },
);
