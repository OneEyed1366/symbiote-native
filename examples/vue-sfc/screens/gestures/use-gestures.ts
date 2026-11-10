import { useRouteSettings } from '../use-route-settings';
import { readGesturesSettings } from './gestures-settings';

export function useGestures() {
  return useRouteSettings(readGesturesSettings);
}
