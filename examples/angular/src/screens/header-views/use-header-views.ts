import { injectRouteSettings } from '../use-route-settings';
import { readHeaderViewsSettings } from './header-views-settings';

export function injectHeaderViews() {
  return injectRouteSettings(readHeaderViewsSettings);
}
