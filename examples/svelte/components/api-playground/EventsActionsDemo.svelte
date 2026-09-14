<script lang="ts">
  // Events & Actions section. `onclick={handler}`-style callback props and combining several
  // handlers on one prop are Yes and are exercised everywhere on this screen already (every
  // ActionButton's onPress); this widget adds one explicit "combine two handlers" example.
  // `on:event` (legacy directive) and its modifiers are No — dead, superseded by the callback-
  // prop convention. `use:action` / the `Action`/`ActionReturn` types are legal on any host tag,
  // which app code now writes directly — `{@attach}` stays the house convention for the same need
  // (it re-runs on a dependency change, an action does not), so the caveat below is a preference
  // rather than a limit.
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

<view class="section-nested">
  <text class="section-label">Events & Actions · combining onX handlers</text>
  <ActionButton
    testID="events-combined-press"
    title={'onPress={() => { a(); b(); }}'}
    color={ACCENT}
    onPress={onCombinedPress}
  />
  <text class="info-text" testID="events-readout">
    {`presses: ${pressCount} · last: ${lastPressLabel}`}
  </text>
  <text class="section-label">use:action / Action / ActionReturn</text>
  <text class="note-text">
    Legal on any host tag, which app code writes directly now. {'{@attach}'} is still
    the house convention for the same need — it re-runs when its dependencies change,
    an action does not. See TemplateSyntaxDemo's measuring box above.
  </text>
</view>
