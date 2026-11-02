import { useExternalStore } from '../use-external-store';
import { createToastStore } from './toast-store';

// One store for the app: the modal asks, the screen below it draws
export const toastStore = createToastStore();

export function useToast() {
  return useExternalStore(toastStore.subscribe, toastStore.snapshot);
}
