<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import { setContext } from 'svelte';
  import { Text, TouchableOpacity, View } from '@symbiote-native/svelte';
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
  let touchableAttachCount = $state(0);
  function onTouchableAttach(): void {
    dlog(
      'api-playground: {@attach} forwarded through TouchableOpacity -> Pressable',
    );
    touchableAttachCount += 1;
  }

  // setContext — registered once here; ContextConsumer.svelte reads it via getContext regardless
  // of where in the render tree it ends up mounted.
  setContext(API_PLAYGROUND_THEME_CONTEXT, { accent: ACCENT });
</script>

<View class="section-nested">
  <Text class="section-label">
    Component Composition · children, snippets, context
  </Text>
  {#if header !== undefined}{@render header()}
  {/if}
  <View class="box-list160" testID="composition-children-slot">
    {@render children?.()}
  </View>
  <Text class="note-text">
    the box above renders CompositionDemo's own `children` snippet — supplied by
    ApiPlaygroundScreen.svelte
  </Text>
  <Text class="section-label">
    {'<svelte:self> — recursive tree'}
  </Text>
  <TreeNode node={TREE} />
  <Text class="section-label">
    {'<svelte:component> (Partial)'}
  </Text>
  <ActionButton
    testID="composition-toggle-badge"
    title="Swap badge"
    color={ACCENT}
    onPress={toggleBadge}
  />
  <svelte:component this={currentBadge} />
  <Text class="note-text">
    Partial — legal, but superseded by a plain component-value reference in
    runes mode; kept here for completeness, not the house convention.
  </Text>
  <Text class="section-label">
    {'{@attach}'} on a component — forwarded through TouchableOpacity
  </Text>
  <TouchableOpacity
    testID="composition-touchable"
    onPress={() => {}}
    {@attach onTouchableAttach}
  >
    <Text class="pressable-label">
      press, or just mount, to fire the attach
    </Text>
  </TouchableOpacity>
  <Text class="info-text" testID="composition-attach-readout">
    {`attach fired: ${touchableAttachCount} time(s)`}
  </Text>
  <Text class="section-label">
    setContext / getContext / hasContext / getAllContexts
  </Text>
  <ContextConsumer />
</View>
