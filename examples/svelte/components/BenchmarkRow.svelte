<script lang="ts" module>
  // One benchmark list row. Its shape is exported from here rather than from the screen because a
  // Svelte component owns its own prop types (the same idiom every adapter component follows) -
  // BenchmarkScreen imports IBenchmarkRow back.
  //
  // Ten native views, the count is the point (see `BenchmarkScreen`): the outer View is 1
  // Each Text is a text plus a `RCTRawText` child (3 x 2), each Pressable is one view (2)
  // The TextInput is one more, its text a prop, and `android_ripple` would add a Pressable view

  // The input is unconditional, as an `{#if}` costs one anchor per instantiation even when false
  // A conditional row shape would add 1 000 retained nodes with the Fabric counters unchanged

  // The input is bare: `class` and a controlled `value`, nothing else
  // `multiline` selects the other intrinsic, and `onChangeText` or `bind:this` add unmeasured work
  export type IBenchmarkRow = {
    id: number;
    label: string;
  };
</script>

<script lang="ts">
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

<view class={isSelected ? 'bench-row bench-row-selected' : 'bench-row'}>
  <text class="bench-row-id">{String(row.id)}</text>
  <pressable class="flex1" p={{ onPress: () => onSelect(row.id) }}>
    <text class="bench-row-label">{row.label}</text>
  </pressable>
  <pressable class="bench-row-remove" p={{ onPress: () => onRemove(row.id) }}>
    <text class="bench-row-remove-text">×</text>
  </pressable>
  <text-input class="bench-row-input" value={row.label}></text-input>
</view>
