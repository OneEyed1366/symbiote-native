<script lang="ts">
  import type { ISwitchChangeEvent } from '@symbiote-native/svelte';

  let {
    testID,
    label,
    value,
    onChange,
    color,
  }: {
    testID: string;
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    color: string;
  } = $props();
</script>

<view class="capability-row">
  <text class="capability-label">{label}</text>
  <switch
    {testID}
    {value}
    onValueChange={(event: ISwitchChangeEvent) => onChange(event.value)}
    trackColor={{ true: color }}
  ></switch>
</view>
