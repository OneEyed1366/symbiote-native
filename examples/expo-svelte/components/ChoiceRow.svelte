<script lang="ts" generics="T extends string | number | boolean | undefined">
  import ActionButton from './ActionButton.svelte';

  let {
    testID,
    label,
    options,
    value,
    onChange,
    color,
  }: {
    testID: string;
    label: string;
    options: readonly { label: string; value: T }[];
    value: T;
    onChange: (value: T) => void;
    color: string;
  } = $props();
</script>

<view {testID}>
  <text class="capability-label">{label}</text>
  <view class="button-row">
    {#each options as option (option.label)}
      <ActionButton
        testID={`${testID}-${option.label}`}
        title={option.value === value ? `● ${option.label}` : option.label}
        onPress={() => onChange(option.value)}
        {color}
      />
    {/each}
  </view>
</view>
