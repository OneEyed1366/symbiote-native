// `NativeTab.Screen` alongside the standalone `NativeTabScreen` export, as in ../tabs/index.ts
import NativeTabImpl from './index.svelte';
import NativeTabScreen from '../native-tab-screen.svelte';

export const NativeTab = Object.assign(NativeTabImpl, {
  Screen: NativeTabScreen,
});

export type { ITabNavigatorHandle as INativeTabNavigatorHandle } from '../../core';
export type { INativeTabProps } from './native-tab-props';
