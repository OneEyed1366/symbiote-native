<script lang="ts" module>
  // One benchmark list row. Its shape is exported from here rather than from the screen because a
  // Svelte component owns its own prop types (the same idiom every adapter component follows) -
  // BenchmarkScreen imports IBenchmarkRow back.
  //
  // TEN native views, and the count is the whole point (see BenchmarkScreen's own note): the
  // outer View is 1, each of the three Texts is a text plus its RCTRawText child (6),
  // each Pressable is exactly one view (2) - Pressable only adds a second host view when
  // android_ripple is supplied, which it is not here - and the TextInput is exactly one more. Its
  // text rides as the `text` prop rather than as a RawText child, so it does not bring the +1 a
  // Text does.
  //
  // The input is UNCONDITIONAL, and on this adapter that is a measurement decision: an `{#if}`
  // costs one anchor per instantiation even while its condition is false, so a row shape behind a
  // conditional would put 1 000 extra retained nodes on the tree with every FABRIC counter reading
  // identically (`svelte-adapter-dom-shim` §32). This component carries no conditional at all.
  //
  // The input is also as bare as it can be: `class` and a controlled `value`, nothing else.
  // `multiline` would select the other intrinsic, and `onChangeText` or `bind:this` would each
  // refuse the lowering outright (a ref arrives as a BindDirective and this transform refuses the
  // whole element on any directive) — lowering is what this row is measured for.
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
