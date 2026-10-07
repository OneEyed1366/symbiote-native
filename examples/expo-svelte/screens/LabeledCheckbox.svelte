<script lang="ts">
  // The checkbox is itself the touch target, the label beside it is plain text as in expo-checkbox
  let {
    testID,
    label,
    value,
    onChange,
    color,
    disabled,
  }: {
    testID: string;
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    color?: string;
    disabled?: boolean;
  } = $props();
</script>

<view class="capability-row">
  <checkbox
    {testID}
    {value}
    {color}
    {disabled}
    onValueChange={event => onChange(event.value)}
  ></checkbox>
  <text class="capability-label">{label}</text>
</view>
