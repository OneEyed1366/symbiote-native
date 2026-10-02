// Solid twin of `../react`/`../vue`'s `NavigationBar`, same shared stack core - only the
// lifecycle wiring differs per adapter (`components_split_logic_view_lifecycle`)

import { createEffect, onCleanup, onMount } from 'solid-js';
import { createColorScheme } from '@symbiote-native/solid';
import {
  popStackEntry,
  pushStackEntry,
  replaceStackEntry,
  type INavigationBarProps,
  type INavigationBarStackEntry,
} from '../core';

export function NavigationBar(props: INavigationBarProps): null {
  const colorScheme = createColorScheme();
  let stackEntry: INavigationBarStackEntry | null = null;

  onMount(() => {
    stackEntry = pushStackEntry({ style: props.style, hidden: props.hidden });
  });

  onCleanup(() => {
    if (stackEntry) popStackEntry(stackEntry);
  });

  createEffect(() => {
    const style = props.style;
    const hidden = props.hidden;
    colorScheme();
    if (stackEntry)
      stackEntry = replaceStackEntry(stackEntry, { style, hidden });
  });

  return null;
}
