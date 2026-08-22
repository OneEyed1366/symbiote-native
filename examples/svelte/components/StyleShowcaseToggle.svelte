<script lang="ts">
  // One toggle row shape, reused by every interactive tile on the styling showcase. `active`
  // drives the label suffix AND the tint, so the button itself reads as the state — the tiles it
  // controls change shape and colour, and a control that looked the same either way would make a
  // dead toggle indistinguishable from a dropped rule. Svelte twin of the local Toggle function
  // in examples/react/screens/StyleShowcaseScreen.tsx.
  import ActionButton from './ActionButton.svelte';
  import { LINE_COLOR } from '../navigation-lines';

  let {
    label,
    active,
    onToggle,
    testID,
  }: {
    label: string;
    active: boolean;
    onToggle: () => void;
    testID: string;
  } = $props();
</script>

<ActionButton
  {testID}
  title={`${label} — ${active ? 'on' : 'off'}`}
  color={active ? LINE_COLOR.styling : '#41506a'}
  onPress={onToggle}
/>
