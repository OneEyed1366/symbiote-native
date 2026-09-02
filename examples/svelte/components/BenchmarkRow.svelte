<script lang="ts" module>
  // One benchmark list row. Its shape is exported from here rather than from the screen because a
  // Svelte component owns its own prop types (the same idiom every adapter component follows) -
  // BenchmarkScreen imports IBenchmarkRow back.
  //
  // TEN native views, and the count is the whole point (see BenchmarkScreen's own note): the
  // outer View is 1, each of the three Texts is a symbiote-text plus its RCTRawText child (6),
  // each Pressable is exactly one symbiote-view (2) - Pressable only adds a second host view when
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
  import { Pressable, Text, TextInput, View } from '@symbiote-native/svelte';

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

<View class={isSelected ? 'bench-row bench-row-selected' : 'bench-row'}>
  <Text class="bench-row-id">{String(row.id)}</Text>
  <Pressable class="flex1" onPress={() => onSelect(row.id)}>
    <Text class="bench-row-label">{row.label}</Text>
  </Pressable>
  <Pressable class="bench-row-remove" onPress={() => onRemove(row.id)}>
    <Text class="bench-row-remove-text">×</Text>
  </Pressable>
  <TextInput class="bench-row-input" value={row.label} />
</View>
