<script lang="ts">
  import type { Snippet } from 'svelte';
  import { SENSOR_STATUS, SENSOR_STATUS_TEXT } from './sensor-status';
  import type { ISensorStatus } from './sensor-status';

  let {
    testID,
    title,
    status,
    children,
  }: {
    testID: string;
    title: string;
    status: ISensorStatus;
    children?: Snippet;
  } = $props();
</script>

<view {testID} class="sensor-card">
  <view class="sensor-card-header">
    <text class="sensor-card-title">{title}</text>
    <view class={`sensor-status-badge sensor-status-badge-${status}`}>
      <text class="sensor-status-text">{SENSOR_STATUS_TEXT[status]}</text>
    </view>
  </view>
  {#if status === SENSOR_STATUS.checking}
    <text class="info-text">checking availability…</text>
  {:else if status === SENSOR_STATUS.unavailable}
    <text class="info-text">not available on this device</text>
  {:else if status === SENSOR_STATUS.waiting}
    <text class="info-text">waiting for first reading…</text>
  {:else}
    {@render children?.()}
  {/if}
</view>
