<script lang="ts">
  import type { ISwitchChangeEvent } from '@symbiote-native/svelte';

  type ISwitchRowProps = {
    testID: string;
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    color: string;
  };

  const TRACK_OFF = '#334155';

  // Label on the left, native switch on the right, tinted by the caller's line colour
  let { testID, label, value, onChange, color }: ISwitchRowProps = $props();
</script>

<view class="switch-row">
  <text class="switch-row-label">{label}</text>
  <switch
    {testID}
    {value}
    onValueChange={(event: ISwitchChangeEvent) => onChange(event.value)}
    trackColor={{ false: TRACK_OFF, true: color }}
  />
</view>
