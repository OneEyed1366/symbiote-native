<script lang="ts">
  // Events & Actions section. `onclick={handler}`-style callback props and combining several
  // handlers on one prop are Yes and are exercised everywhere on this screen already (every
  // ActionButton's onPress); this widget adds one explicit "combine two handlers" example.
  // `on:event` (legacy directive) and its modifiers are No — dead, superseded by the callback-
  // prop convention. `use:action` / the `Action`/`ActionReturn` types are Partial: legal only on
  // a raw element, and app code never authors one (only this adapter's own View.svelte etc. do),
  // so there is nothing to run here — the caveat below IS the demo.
  import { Text, View } from '@symbiote-native/svelte';
  import { dlog } from '@symbiote-native/engine';
  import ActionButton from '../ActionButton.svelte';

  const ACCENT = '#5ec8f2';

  let pressCount = $state(0);
  let lastPressLabel = $state('never pressed');

  function logPress(label: string): void {
    dlog(`api-playground: combined handler saw a press (${label})`);
  }
  function recordPress(label: string): void {
    pressCount += 1;
    lastPressLabel = label;
  }

  // Two ordinary functions wrapped by one inline arrow — Svelte's own idiom for combining
  // multiple handlers on a single onX prop, no special syntax involved.
  function onCombinedPress(): void {
    logPress('combined');
    recordPress('combined');
  }
</script>

<View class="section-nested">
  <Text class="section-label">Events & Actions · combining onX handlers</Text>
  <ActionButton
    testID="events-combined-press"
    title={'onPress={() => { a(); b(); }}'}
    color={ACCENT}
    onPress={onCombinedPress}
  />
  <Text class="info-text" testID="events-readout">
    {`presses: ${pressCount} · last: ${lastPressLabel}`}
  </Text>
  <Text class="section-label">use:action / Action / ActionReturn</Text>
  <Text class="note-text">
    Partial — legal only on a raw element, and app code here never authors one
    (only this adapter's own View.svelte / Text.svelte / … do, over `symbiote-*`
    tags). {'{@attach}'} is the house convention for the equivalent "run against the
    raw node" need — see TemplateSyntaxDemo's measuring box above.
  </Text>
</View>
