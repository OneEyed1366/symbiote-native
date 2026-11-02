<script lang="ts" generics="T extends string">
  const SELECTED_TEXT_COLOR = '#0b1622';

  // A row of pills for an option with a few fixed values, the chosen one is filled
  let {
    testID,
    value,
    options,
    onChange,
    color,
  }: {
    testID: string;
    value: T;
    options: readonly T[];
    onChange: (next: T) => void;
    color: string;
  } = $props();
</script>

<view {testID} class="choice-row">
  {#each options as option (option)}
    <pressable
      testID={`${testID}-${option}`}
      class="choice-chip"
      p={{ onPress: () => onChange(option) }}
      style={{
        borderColor: color,
        backgroundColor: option === value ? color : 'transparent',
      }}
    >
      <text
        class="choice-chip-text"
        style={{ color: option === value ? SELECTED_TEXT_COLOR : color }}
      >
        {option}
      </text>
    </pressable>
  {/each}
</view>
