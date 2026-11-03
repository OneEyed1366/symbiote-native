import { useRouteSettings } from '../use-route-settings.svelte';
import { readGesturesSettings } from './gestures-settings';

export function useGestures() {
  return useRouteSettings(readGesturesSettings);
}
