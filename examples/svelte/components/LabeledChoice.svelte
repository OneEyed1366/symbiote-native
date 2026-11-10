<script lang="ts" generics="T extends string">
  import ChoiceRow from './ChoiceRow.svelte';

  // A caption over a row of pills, for panels that hold several choices
  let {
    label,
    ...choice
  }: {
    testID: string;
    label: string;
    value: T;
    options: readonly T[];
    onChange: (next: T) => void;
    color: string;
  } = $props();
</script>

<text class="switch-label">{label}</text>
<ChoiceRow {...choice} />
