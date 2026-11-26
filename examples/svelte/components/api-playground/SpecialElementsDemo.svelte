<script lang="ts">
  // Special Elements section: the `<svelte:window|document|body|head>` tags cannot compile
  // `preprocessor/forbid-web-only-constructs.ts` forbids them, use the RN twins instead
  // `<svelte:element>` and `<svelte:boundary>` are live, and `<svelte:options>` gets a text panel
  import { hostProps } from '@symbiote-native/svelte/native-view-bridge';
  import ActionButton from '../ActionButton.svelte';
  import BoundaryChild from './BoundaryChild.svelte';

  const ACCENT = '#b18cf5';

  // `<svelte:element this={...}>` picks the host tag at runtime
  // `packages/navigation/src/svelte` needs it to reach a capitalized native view like `RNSScreen`

  // `{@attach hostProps(...)}` writes the whole bag on the dynamic tag in one step
  let dynamicTag = $state<'view' | 'text'>('view');
  function toggleDynamicTag(): void {
    dynamicTag = dynamicTag === 'view' ? 'text' : 'view';
  }
  // `testID` rides in the same bag as `style`, as a plain `p={bag}` on a dynamic tag fails
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

  // `<svelte:boundary>` catches a real init-time throw in the `failed` snippet
  // A script body runs once, so `{#key shouldThrow}` recreates the child on each toggle
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
