import { injectExternalStore } from '../use-external-store';
import { createToastStore } from './toast-store';

// One store for the app: the modal asks, the screen below it draws
export const toastStore = createToastStore();

export function injectToast() {
  return injectExternalStore(toastStore.subscribe, toastStore.snapshot);
}
