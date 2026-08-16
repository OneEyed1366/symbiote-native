// `Drawer.Screen` alongside the standalone `DrawerScreen` export, matching React's and Vue's
// barrels - see ../stack/index.ts for why Object.assign is the right mechanism on a compiled
// Svelte component.
import DrawerImpl from './index.svelte';
import DrawerScreen from '../drawer-screen.svelte';

export const Drawer = Object.assign(DrawerImpl, { Screen: DrawerScreen });

export type { IDrawerNavigatorHandle, IDrawerDescriptorMap } from '../../core';
export type { IDrawerContentSlotProps, IDrawerProps } from './drawer-props';
