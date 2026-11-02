import { Component, computed, input } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, switchMap, timer } from 'rxjs';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { FullWindowOverlay } from '@symbiote-native/navigation/angular';
import type { IToastKind } from './toast-store';
import { injectToast, toastStore } from './use-toast';

const TOAST_MS = 2_500;
const TREE_KIND = 'tree' satisfies IToastKind;

@Component({
  selector: 'ToastBubble',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [class]="bubbleClass()">
      <text class="toast-text">{{ text() }}</text>
    </view>
  `,
})
export class ToastBubble {
  readonly text = input.required<string>();
  readonly bubbleClass = input.required<string>();
}

// Drawn by the screen below the modal, the overlay one rides in its own window above everything
@Component({
  selector: 'ToastHost',
  standalone: true,
  imports: [FullWindowOverlay, ToastBubble],
  template: `
    @if (toast() !== null) {
      @if (isTree()) {
        <ToastBubble
          bubbleClass="toast toast-tree"
          text="Drawn by the screen below the modal"
        ></ToastBubble>
      } @else {
        <FullWindowOverlay
          [unstable_accessibilityContainerViewIsModal]="isOverlayModal()"
        >
          <ToastBubble
            bubbleClass="toast toast-overlay"
            text="Drawn in a FullWindowOverlay"
          ></ToastBubble>
        </FullWindowOverlay>
      }
    }
  `,
})
export class ToastHost {
  readonly isOverlayModal = input.required<boolean>();

  readonly toast = injectToast();
  readonly isTree = computed(() => this.toast()?.kind === TREE_KIND);

  constructor() {
    // Each new toast restarts the countdown, an empty slot cancels it
    toObservable(this.toast)
      .pipe(
        switchMap(toast => (toast === null ? EMPTY : timer(TOAST_MS))),
        takeUntilDestroyed(),
      )
      .subscribe(() => toastStore.hide());
  }
}
