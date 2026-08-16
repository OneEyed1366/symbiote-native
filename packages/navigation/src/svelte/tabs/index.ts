// `Tab.Screen` alongside the standalone `TabScreen` export, matching React's and Vue's barrels -
// see ../stack/index.ts for why Object.assign is the right mechanism on a compiled Svelte
// component.
import TabImpl from './index.svelte';
import TabScreen from '../tab-screen.svelte';

export const Tab = Object.assign(TabImpl, { Screen: TabScreen });

export type { ITabNavigatorHandle } from '../../core';
export type { ITabProps } from './tab-props';
