<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import { setContext } from 'svelte';
  import { TouchableOpacity } from '@symbiote-native/svelte';
  import { dlog } from '@symbiote-native/engine';
  import ActionButton from '../ActionButton.svelte';
  import TreeNode from './TreeNode.svelte';
  import type { IApiPlaygroundTreeNode } from './TreeNode.svelte';
  import SunBadge from './SunBadge.svelte';
  import MoonBadge from './MoonBadge.svelte';
  import ContextConsumer, {
    API_PLAYGROUND_THEME_CONTEXT,
  } from './ContextConsumer.svelte';

  const ACCENT = '#5ec8f2';

  const TREE: IApiPlaygroundTreeNode = {
    label: 'root',
    children: [
      {
        label: 'branch A',
        children: [{ label: 'leaf A1' }, { label: 'leaf A2' }],
      },
      { label: 'branch B' },
    ],
  };
</script>

<script lang="ts">
  // Component Composition section. `children` + {@render children?.()} (the parent-supplied
  // default snippet) and a named snippet prop (`header`) are demoed by ApiPlaygroundScreen.svelte
  // passing both INTO this component — the mechanism only shows up from the outside.
  let { children, header }: { children?: Snippet; header?: Snippet } = $props();

  // <svelte:component> — Partial: legal, but superseded by a plain component-value reference,
  // which is why every other component on this screen is just `<TreeNode>`/`<ActionButton>`
  // rather than `<svelte:component this={TreeNode}>`.
  let showSun = $state(true);
  const currentBadge = $derived(showSun ? SunBadge : MoonBadge);
  function toggleBadge(): void {
    showSun = !showSun;
  }

  // {@attach} on a COMPONENT, forwarded for free: TouchableOpacity owns no host tag of its own —
  // it re-spreads `...rest` onto Pressable, and a symbol-keyed attachment prop survives that
  // spread with zero forwarding code in TouchableOpacity itself (svelte-adapter-dom-shim skill
  // §22c, category 2).
  // The run counter is a plain closure variable, exactly as in RunesDemo's $effect: an
  // attachment body runs inside an effect, so `touchableAttachCount += 1` would READ the $state
  // it writes, and Svelte re-runs the effect on its own write forever
  // (`effect_update_depth_exceeded`). Write-only into the $state keeps the readout reactive with
  // no self-dependency.
  let attachRunsRaw = 0;
  let touchableAttachCount = $state(0);
  function onTouchableAttach(): void {
    dlog(
      'api-playground: {@attach} forwarded through TouchableOpacity -> Pressable',
    );
    attachRunsRaw += 1;
    touchableAttachCount = attachRunsRaw;
  }

  // setContext — registered once here; ContextConsumer.svelte reads it via getContext regardless
  // of where in the render tree it ends up mounted.
  setContext(API_PLAYGROUND_THEME_CONTEXT, { accent: ACCENT });
</script>

<view class="section-nested">
  <text class="section-label">
    Component Composition · children, snippets, context
  </text>
  {#if header !== undefined}{@render header()}
  {/if}
  <view class="box-list160" testID="composition-children-slot">
    {@render children?.()}
  </view>
  <text class="note-text">
    the box above renders CompositionDemo's own `children` snippet — supplied by
    ApiPlaygroundScreen.svelte
  </text>
  <text class="section-label">
    {'<svelte:self> — recursive tree'}
  </text>
  <TreeNode node={TREE} />
  <text class="section-label">
    {'<svelte:component> (Partial)'}
  </text>
  <ActionButton
    testID="composition-toggle-badge"
    title="Swap badge"
    color={ACCENT}
    onPress={toggleBadge}
  />
  <svelte:component this={currentBadge} />
  <text class="note-text">
    Partial — legal, but superseded by a plain component-value reference in
    runes mode; kept here for completeness, not the house convention.
  </text>
  <text class="section-label">
    {'{@attach}'} on a component — forwarded through TouchableOpacity
  </text>
  <TouchableOpacity
    testID="composition-touchable"
    onPress={() => {}}
    {@attach onTouchableAttach}
  >
    <text class="pressable-label">
      press, or just mount, to fire the attach
    </text>
  </TouchableOpacity>
  <text class="info-text" testID="composition-attach-readout">
    {`attach fired: ${touchableAttachCount} time(s)`}
  </text>
  <text class="section-label">
    setContext / getContext / hasContext / getAllContexts
  </text>
  <ContextConsumer />
</view>
