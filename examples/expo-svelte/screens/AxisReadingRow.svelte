<script lang="ts">
  let { measurement }: { measurement: { x: number; y: number; z: number } } =
    $props();
</script>

<view class="sensor-reading-row">
  <view class="sensor-reading-chip">
    <text class="sensor-reading-label">X</text>
    <text class="sensor-reading-value">{measurement.x.toFixed(3)}</text>
  </view>
  <view class="sensor-reading-chip">
    <text class="sensor-reading-label">Y</text>
    <text class="sensor-reading-value">{measurement.y.toFixed(3)}</text>
  </view>
  <view class="sensor-reading-chip">
    <text class="sensor-reading-label">Z</text>
    <text class="sensor-reading-value">{measurement.z.toFixed(3)}</text>
  </view>
</view>
