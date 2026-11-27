<script>
  // The same ten-node row every other suite arm builds
  // Its own component so the each-block has a real boundary, as a benchmark row does
  import {
    CELL_STYLE,
    INPUT_STYLE,
    ROW_STYLE,
    SELECTED_ROW_STYLE,
  } from './bench-suite';

  let { row, isSelected } = $props();
</script>

<view style={isSelected ? SELECTED_ROW_STYLE : ROW_STYLE}>
  <text ellipsizeMode="tail">{String(row.id)}</text>
  <view style={CELL_STYLE}>
    <text ellipsizeMode="tail">{row.label}</text>
  </view>
  <view style={CELL_STYLE}>
    <text ellipsizeMode="tail">x</text>
  </view>
  <text-input style={INPUT_STYLE} text={row.label} />
</view>
