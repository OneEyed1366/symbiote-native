import { DestroyRef, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { AppState, KEYBOARD_EVENT, Keyboard } from '@symbiote-native/angular';
import { REFRESH_MS, keyboardHeightOf } from './canary-shared';

// native -> JS: the device hub pushes keyboard frames, the height is read live
export function injectKeyboardHeight(): Signal<number> {
  const height = signal(0);
  const subscriptions = [
    Keyboard.addListener(KEYBOARD_EVENT.didShow, (payload: unknown) =>
      height.set(keyboardHeightOf(payload)),
    ),
    Keyboard.addListener(KEYBOARD_EVENT.didHide, () => height.set(0)),
  ];
  inject(DestroyRef).onDestroy(() =>
    subscriptions.forEach(subscription => subscription.remove()),
  );
  return height;
}

// native -> JS: AppState pushes lifecycle changes, the current phase is read live
export function injectAppPhase(): Signal<string> {
  const phase = signal<string>(AppState.currentState ?? 'unknown');
  const subscription = AppState.addEventListener('change', next => {
    if (typeof next === 'string') phase.set(next);
  });
  inject(DestroyRef).onDestroy(() => subscription.remove());
  return phase;
}

export function injectPullRefresh() {
  const destroyRef = inject(DestroyRef);
  const isRefreshing = signal(false);
  const refreshes = signal(0);
  const onRefresh = (): void => {
    isRefreshing.set(true);
    timer(REFRESH_MS)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        isRefreshing.set(false);
        refreshes.update(value => value + 1);
      });
  };
  return { isRefreshing, refreshes, onRefresh };
}
