<script lang="ts">
  let {
    testID,
    label,
    value,
  }: { testID: string; label: string; value: string } = $props();
</script>

<view class="capability-row">
  <text class="capability-label">{label}</text>
  <text {testID} class="value-text">{value}</text>
</view>
