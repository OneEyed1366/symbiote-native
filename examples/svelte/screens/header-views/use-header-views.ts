import { useRouteSettings } from '../use-route-settings.svelte';
import { readHeaderViewsSettings } from './header-views-settings';

export function useHeaderViews() {
  return useRouteSettings(readHeaderViewsSettings);
}
