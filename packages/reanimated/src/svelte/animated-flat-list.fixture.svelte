<script module lang="ts">
  import type AnimatedFlatListComponent from './animated-flat-list.svelte';

  // The list a test reaches its imperative handle through
  export const bound: {
    list: ReturnType<typeof AnimatedFlatListComponent> | null;
  } = { list: null };
</script>

<script lang="ts">
  import AnimatedFlatList from './animated-flat-list.svelte';

  type IRow = { id: string };

  let props: Record<string, unknown> = $props();

  const data: IRow[] = [{ id: 'a' }, { id: 'b' }];
  const fade = () => ({
    animations: {},
    initialValues: {},
    callback: undefined,
  });
</script>

<AnimatedFlatList
  bind:this={bound.list}
  {data}
  keyExtractor={(row: IRow) => row.id}
  {...props}
>
  {#snippet item()}
    <view p={{ entering: fade }} />
  {/snippet}
</AnimatedFlatList>
