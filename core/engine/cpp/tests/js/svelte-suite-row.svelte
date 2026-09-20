<script>
  // The same ten-node row every other suite arm builds. Its own component so the each-block below
  // has a real boundary, which is what a benchmark row is — see `svelte-adapter-dom-shim` on what a
  // component boundary costs an each-block in anchors.
  import {
    CELL_STYLE,
    INPUT_STYLE,
    ROW_STYLE,
    SELECTED_ROW_STYLE,
  } from './bench-suite';

  let { row, isSelected } = $props();
</script>

<view
  style={isSelected ? SELECTED_ROW_STYLE : ROW_STYLE}
  testID={`row-${row.id}`}
>
  <text ellipsizeMode="tail">{String(row.id)}</text>
  <view style={CELL_STYLE}>
    <text ellipsizeMode="tail">{row.label}</text>
  </view>
  <view style={CELL_STYLE}>
    <text ellipsizeMode="tail">x</text>
  </view>
  <text-input style={INPUT_STYLE} text={row.label} />
</view>
