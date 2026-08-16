// `Stack.Screen` alongside the standalone `Screen` export, matching React's and Vue's barrels.
// A compiled Svelte component is an ordinary function object, so attaching the marker to it is
// the same Object.assign the other entries do - and `<Stack.Screen />` resolves through Svelte's
// member-expression component tags (verified against the real compiler).
import StackImpl from './index.svelte';
import Screen from '../screen.svelte';

export const Stack = Object.assign(StackImpl, { Screen });

export type { INavigatorHandle } from '../../core';
export type { IStackProps } from './stack-props';
