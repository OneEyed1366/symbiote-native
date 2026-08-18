<script lang="ts">
  // Special Elements section. <svelte:window|document|body|head> are No — forbidden at build
  // time by preprocessor/forbid-web-only-constructs.ts, use the RN twins (Dimensions/AppState/
  // StatusBar) instead — no demo, they cannot compile. <svelte:element> and <svelte:boundary> are
  // Yes; <svelte:options> is Partial (a per-FILE compiler directive, not something a runtime
  // widget can meaningfully toggle) and gets a text panel instead of a live widget.
  import { Text, View } from '@symbiote-native/svelte';
  import ActionButton from '../ActionButton.svelte';
  import BoundaryChild from './BoundaryChild.svelte';
  import { hostProps } from './shim-node-guard';

  const ACCENT = '#b18cf5';

  // <svelte:element this={...}> — for illustration only. Ordinary app code should never author a
  // raw `symbiote-*` tag directly (svelte-adapter-dom-shim skill §7's own table: "app code never
  // authors a host tag"); the real, load-bearing use of a dynamic tag is reaching a CAPITALIZED
  // native Fabric view with no hyphenated wrapper of its own (RNSScreen, RNSSearchBar — see
  // packages/navigation/src/svelte), which is adapter-internal, not app-level. This still proves
  // the exact mechanism those packages depend on: props MUST go through {@attach hostProps(...)},
  // never a `p={bag}` attribute — a dynamic tag compiles through Svelte's generic setAttribute
  // codegen, so an attribute silently fails to land.
  let dynamicTag = $state<'symbiote-view' | 'symbiote-text'>('symbiote-view');
  function toggleDynamicTag(): void {
    dynamicTag =
      dynamicTag === 'symbiote-view' ? 'symbiote-text' : 'symbiote-view';
  }
  // `testID` rides inside the SAME bag as `style` — a plain attribute on a dynamic tag is just as
  // dead as a plain `p={bag}` attribute would be (both go through the generic setAttribute
  // codegen, which ShimElement only mirrors into a cosmetic internal Map, never into routeProp).
  const dynamicTagBag = $derived(
    dynamicTag === 'symbiote-text'
      ? {
          testID: 'special-dynamic-tag',
          style: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },
        }
      : {
          testID: 'special-dynamic-tag',
          style: {
            width: 56,
            height: 56,
            borderRadius: 12,
            backgroundColor: ACCENT,
          },
        },
  );

  // <svelte:boundary> — a real init-time throw, caught by the `failed` snippet, with `onerror`
  // and `reset()` both exercised. A component's <script> body runs once, at creation — flipping
  // `shouldThrow` on an already-mounted BoundaryChild would never re-throw, so it is wrapped in
  // {#key shouldThrow} to force a fresh instance (and a fresh init) on every toggle.
  let shouldThrow = $state(false);
  let lastBoundaryError = $state<string | undefined>(undefined);
  function triggerThrow(): void {
    shouldThrow = true;
  }
  function onBoundaryError(error: unknown): void {
    lastBoundaryError = error instanceof Error ? error.message : String(error);
  }
  function resetBoundary(reset: () => void): void {
    shouldThrow = false;
    reset();
  }
</script>

<View class="section-nested">
  <Text class="section-label">
    {'<svelte:element this={...}>'}
  </Text>
  <ActionButton
    testID="special-toggle-tag"
    title="Swap tag (symbiote-view / symbiote-text)"
    color={ACCENT}
    onPress={toggleDynamicTag}
  />
  <Text class="note-text" testID="special-tag-readout">
    {`this = ${dynamicTag}`}
  </Text>
  <svelte:element this={dynamicTag} {@attach hostProps(dynamicTagBag)}>
    {dynamicTag === 'symbiote-text'
      ? 'a real <symbiote-text> — dynamically chosen'
      : ''}
  </svelte:element>
  <Text class="section-label">
    {'<svelte:boundary>'}
  </Text>
  <ActionButton
    testID="special-trigger-throw"
    title="Make the child throw"
    color={ACCENT}
    onPress={triggerThrow}
  />
  <svelte:boundary onerror={onBoundaryError}>
    {#snippet failed(error, reset)}
      <View class="row-align-center">
        <Text class="info-text-flex" testID="special-boundary-error">
          {`caught: ${error instanceof Error ? error.message : String(error)}`}
        </Text>
        <ActionButton
          testID="special-boundary-reset"
          title="reset()"
          color={ACCENT}
          onPress={() => resetBoundary(reset)}
        />
      </View>
    {/snippet}
    {#key shouldThrow}
      <BoundaryChild {shouldThrow} />
    {/key}
  </svelte:boundary>
  <Text class="note-text" testID="special-boundary-onerror-readout">
    {lastBoundaryError === undefined
      ? 'onerror: not fired yet'
      : `onerror last saw: ${lastBoundaryError}`}
  </Text>
  <Text class="section-label">
    {'<svelte:options>'}
  </Text>
  <Text class="note-text">
    Partial — a per-file compiler directive (runes / namespace / customElement /
    css / legacy immutable-accessors), not something a runtime widget can
    toggle. `css`/`runes` are already fixed project-wide in svelte.config.js;
    `namespace` (svg/mathml) and `customElement` target concepts this project
    has none of.
  </Text>
</View>
