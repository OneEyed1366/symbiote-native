<script lang="ts">
  import { untrack } from 'svelte';
  import { useColorScheme } from '@symbiote-native/svelte';
  import {
    popStackEntry,
    pushStackEntry,
    replaceStackEntry,
    type INavigationBarProps,
    type INavigationBarStackEntry,
  } from '../core';

  let { style, hidden }: INavigationBarProps = $props();
  const colorScheme = useColorScheme();
  let stackEntry: INavigationBarStackEntry | null = null;

  $effect(() => {
    const entry = pushStackEntry(untrack(() => ({ style, hidden })));
    stackEntry = entry;
    return () => popStackEntry(entry);
  });

  $effect(() => {
    void style;
    void hidden;
    void colorScheme.current;
    if (stackEntry) stackEntry = replaceStackEntry(stackEntry, { style, hidden });
  });
</script>
