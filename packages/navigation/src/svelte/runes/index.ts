// The lifecycle bucket. `runes/` (with `*.svelte.ts` files) is Svelte's own term for
// $state/$effect, parallel to React's `hooks/` and Vue's `composables/` - per CLAUDE.md's
// <adapter_src_follows_framework_idioms>, every framework entry names this bucket after ITS
// framework's word for the concept, never a borrowed one.

export { useNavigation } from './use-navigation.svelte';
export type { INavigationHandle } from './use-navigation.svelte';
export { useStackNavigation } from './use-stack-navigation.svelte';
export type { IStackNavigationHandle } from './use-stack-navigation.svelte';
export { useTabNavigation } from './use-tab-navigation.svelte';
export type { ITabNavigationHandle } from './use-tab-navigation.svelte';
export { useDrawerNavigation } from './use-drawer-navigation.svelte';
export type { IDrawerNavigationHandle } from './use-drawer-navigation.svelte';
export { useRoute } from './use-route.svelte';
export { useIsFocused } from './use-is-focused.svelte';
export { useFocusEffect } from './use-focus-effect.svelte';
export { useNavigationState } from './use-navigation-state.svelte';
