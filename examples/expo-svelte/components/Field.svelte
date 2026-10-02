<script lang="ts">
  let {
    testID,
    label,
    value,
    onChange,
    placeholder,
    multiline,
  }: {
    testID: string;
    label: string;
    value: string;
    onChange: (text: string) => void;
    placeholder?: string;
    multiline?: boolean;
  } = $props();
</script>

<view>
  <text class="capability-label">{label}</text>
  <text-input
    {testID}
    {value}
    onValueChange={event => onChange(event.text)}
    {placeholder}
    placeholderTextColor="#41506a"
    autoCapitalize="none"
    {multiline}
    class="text-input"
  ></text-input>
</view>
