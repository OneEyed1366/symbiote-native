<script lang="ts" module>
  // One benchmark list row. Its shape is exported from here rather than from the screen because a
  // Svelte component owns its own prop types (the same idiom every adapter component follows) -
  // BenchmarkScreen imports IBenchmarkRow back.
  //
  // NINE native views, and the count is the whole point (see BenchmarkScreen's own note): the
  // outer View is 1, each of the three Texts is a symbiote-text plus its RCTRawText child (6),
  // and each Pressable is exactly one symbiote-view (2) - Pressable only adds a second host view
  // when android_ripple is supplied, which it is not here.
  export type IBenchmarkRow = {
    id: number;
    label: string;
  };
</script>

<script lang="ts">
  import { Pressable, Text, View } from '@symbiote-native/svelte';

  let {
    row,
    isSelected,
    onSelect,
    onRemove,
  }: {
    row: IBenchmarkRow;
    isSelected: boolean;
    onSelect: (id: number) => void;
    onRemove: (id: number) => void;
  } = $props();
</script>

<View class={isSelected ? 'bench-row bench-row-selected' : 'bench-row'}
  ><Text class="bench-row-id">{String(row.id)}</Text><Pressable
    class="flex1"
    onPress={() => onSelect(row.id)}
    ><Text class="bench-row-label">{row.label}</Text></Pressable
  ><Pressable class="bench-row-remove" onPress={() => onRemove(row.id)}
    ><Text class="bench-row-remove-text">×</Text></Pressable
  ></View
>
