// Tab's own public prop surface. Plain `.ts` for the tsc-cannot-see-a-`.svelte`-named-export
// reason ../screen-props.ts documents.

import type { Snippet } from 'svelte';
import type { ITabOptions } from '../../core';

// React's `children?: ReactNode` / Vue's default slot become a Svelte Snippet holding the
// `<Tab.Screen>` markers.
export type ITabProps = {
  initialRouteName?: string;
  screenOptions?: ITabOptions;
  children?: Snippet;
};
