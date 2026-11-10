import type { INavigatorState } from '@symbiote-native/navigation';
import { ROUTE_NAME } from '../../routes';

export const PRESET_CHOICES = ['menu', 'details', 'hub'] as const;

type IPreset = (typeof PRESET_CHOICES)[number];
type IPresetRoute = { name: string; params?: unknown };

const PRESET_ROUTES: Record<IPreset, readonly IPresetRoute[]> = {
  menu: [{ name: ROUTE_NAME.Menu }],
  details: [
    { name: ROUTE_NAME.Menu },
    { name: ROUTE_NAME.Details, params: { id: '7' } },
  ],
  hub: [
    { name: ROUTE_NAME.Menu },
    { name: ROUTE_NAME.NavigationHub },
    { name: ROUTE_NAME.HooksDemo },
  ],
};

// A stack written by hand, the shape `reset` takes after a login or a sign out
export function presetState(preset: IPreset): INavigatorState {
  return {
    routes: PRESET_ROUTES[preset].map((route, index) => ({
      key: `preset-${preset}-${index}`,
      name: route.name,
      params: route.params,
    })),
  };
}

// Valid JSON that is no navigator state: a route needs a key
export function breakSnapshot(): string {
  return JSON.stringify({ routes: [{ name: ROUTE_NAME.Menu }] });
}
