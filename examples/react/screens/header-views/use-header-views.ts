import { useRouteSettings } from '../use-route-settings';
import { readHeaderViewsSettings } from './header-views-settings';

export function useHeaderViews() {
  return useRouteSettings(readHeaderViewsSettings);
}
