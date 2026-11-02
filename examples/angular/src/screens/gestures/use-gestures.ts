import { injectRouteSettings } from '../use-route-settings';
import { readGesturesSettings } from './gestures-settings';

export function injectGestures() {
  return injectRouteSettings(readGesturesSettings);
}
