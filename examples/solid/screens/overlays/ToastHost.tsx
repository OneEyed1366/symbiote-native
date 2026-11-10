import { createEffect, onCleanup, Show } from 'solid-js';
import { FullWindowOverlay } from '@symbiote-native/navigation/solid';
import type { IToastKind } from './toast-store';
import { createToast, toastStore } from './use-toast';

const TOAST_MS = 2_500;
const TREE_KIND = 'tree' satisfies IToastKind;

type IToastHostProps = { isOverlayModal: boolean };

type IToastBubbleProps = { text: string; class: string };

function ToastBubble(props: IToastBubbleProps) {
  return (
    <view class={props.class}>
      <text class="toast-text">{props.text}</text>
    </view>
  );
}

// Drawn by the screen below the modal, the overlay one rides in its own window above everything
export function ToastHost(props: IToastHostProps) {
  const toast = createToast();
  createEffect(() => {
    if (toast() === null) return;
    const timer = setTimeout(toastStore.hide, TOAST_MS);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <Show when={toast() !== null}>
      <Show
        when={toast()?.kind === TREE_KIND}
        fallback={
          <FullWindowOverlay
            unstable_accessibilityContainerViewIsModal={props.isOverlayModal}
          >
            <ToastBubble
              class="toast toast-overlay"
              text="Drawn in a FullWindowOverlay"
            />
          </FullWindowOverlay>
        }
      >
        <ToastBubble
          class="toast toast-tree"
          text="Drawn by the screen below the modal"
        />
      </Show>
    </Show>
  );
}
