<script lang="ts">
  // Special Elements section. <svelte:window|document|body|head> are No — forbidden at build
  // time by preprocessor/forbid-web-only-constructs.ts, use the RN twins (Dimensions/AppState/
  // StatusBar) instead — no demo, they cannot compile. <svelte:element> and <svelte:boundary> are
  // Yes; <svelte:options> is Partial (a per-FILE compiler directive, not something a runtime
  // widget can meaningfully toggle) and gets a text panel instead of a live widget.
  import ActionButton from '../ActionButton.svelte';
  import BoundaryChild from './BoundaryChild.svelte';
  import { hostProps } from './shim-node-guard';

  const ACCENT = '#b18cf5';

  // <svelte:element this={...}> — a host tag chosen at runtime. Ordinary markup names the tag
  // literally; this spelling is what `packages/navigation/src/svelte` needs to reach a CAPITALIZED
  // native Fabric view (RNSScreen, RNSSearchBar) that has no lowercase name of its own.
  //
  // `{@attach hostProps(...)}` rather than plain attributes is a preference here, not a
  // requirement — `setAttribute` routes every key through `routeProp` now, so a dynamic tag lands
  // its props the same way a literal one does
  // (.claude/rules/svelte-shim-element-global-must-be-an-ancestor.md).
  let dynamicTag = $state<'view' | 'text'>('view');
  function toggleDynamicTag(): void {
    dynamicTag = dynamicTag === 'view' ? 'text' : 'view';
  }
  // `testID` rides inside the SAME bag as `style` — a plain attribute on a dynamic tag is just as
  // dead as a plain `p={bag}` attribute would be (both go through the generic setAttribute
  // codegen, which ShimElement only mirrors into a cosmetic internal Map, never into routeProp).
  const dynamicTagBag = $derived(
    dynamicTag === 'text'
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

<view class="section-nested">
  <text class="section-label">
    {'<svelte:element this={...}>'}
  </text>
  <ActionButton
    testID="special-toggle-tag"
    title="Swap tag (view / text)"
    color={ACCENT}
    onPress={toggleDynamicTag}
  />
  <text class="note-text" testID="special-tag-readout">
    {`this = ${dynamicTag}`}
  </text>
  <svelte:element this={dynamicTag} {@attach hostProps(dynamicTagBag)}>
    {dynamicTag === 'text' ? 'a real <text> — dynamically chosen' : ''}
  </svelte:element>
  <text class="section-label">
    {'<svelte:boundary>'}
  </text>
  <ActionButton
    testID="special-trigger-throw"
    title="Make the child throw"
    color={ACCENT}
    onPress={triggerThrow}
  />
  <svelte:boundary onerror={onBoundaryError}>
    {#snippet failed(error, reset)}
      <view class="row-align-center">
        <text class="info-text-flex" testID="special-boundary-error">
          {`caught: ${error instanceof Error ? error.message : String(error)}`}
        </text>
        <ActionButton
          testID="special-boundary-reset"
          title="reset()"
          color={ACCENT}
          onPress={() => resetBoundary(reset)}
        />
      </view>
    {/snippet}
    {#key shouldThrow}
      <BoundaryChild {shouldThrow} />
    {/key}
  </svelte:boundary>
  <text class="note-text" testID="special-boundary-onerror-readout">
    {lastBoundaryError === undefined
      ? 'onerror: not fired yet'
      : `onerror last saw: ${lastBoundaryError}`}
  </text>
  <text class="section-label">
    {'<svelte:options>'}
  </text>
  <text class="note-text">
    Partial — a per-file compiler directive (runes / namespace / customElement /
    css / legacy immutable-accessors), not something a runtime widget can
    toggle. `css`/`runes` are already fixed project-wide in svelte.config.js;
    `namespace` (svg/mathml) and `customElement` target concepts this project
    has none of.
  </text>
</view>
