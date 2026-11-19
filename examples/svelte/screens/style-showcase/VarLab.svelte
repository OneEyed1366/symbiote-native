<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    getComputedVariable,
    hostInstance,
    setVariable,
    useRootTag,
    type IHostInstance,
  } from '@symbiote-native/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { LINE_COLOR } from '../../navigation-lines';
  import PrecedenceTile from './PrecedenceTile.svelte';

  const ACCENT_NAME = '--lab-accent';
  const ACCENT_OVERRIDE = '#ffbe0b';

  const surface = useRootTag();
  let swatch: unknown = $state.raw(undefined);
  let accent = $state('');
  let isOverridden = $state(false);

  function accentOf(node: IHostInstance | undefined): string {
    return node === undefined ? '' : getComputedVariable(node, ACCENT_NAME);
  }

  // The write belongs to the surface, so leaving the screen takes it back
  onDestroy(() => setVariable(surface, ACCENT_NAME, undefined));
  onMount(() => {
    accent = accentOf(hostInstance(swatch));
  });

  function onToggle() {
    setVariable(surface, ACCENT_NAME, isOverridden ? undefined : ACCENT_OVERRIDE);
    isOverridden = !isOverridden;
    accent = accentOf(hostInstance(swatch));
  }
</script>

<view class="sc-panel">
  <text class="sc-panel-title">12 · Device lab: var(), setVariable</text>
  <text class="sc-tile-label">A :root TOKEN, THEN THE SURFACE'S OWN</text>
  <view class="lab-row">
    <view bind:this={swatch} class="lab-var-swatch" testID="lab-var-swatch" />
    <text class="lab-readout" testID="lab-var-readout">
      {`${ACCENT_NAME}=${accent}`}
    </text>
  </view>
  <ActionButton
    testID="lab-var-toggle"
    title={isOverridden ? 'Drop the surface value' : 'Write the surface value'}
    color={LINE_COLOR.styling}
    onPress={onToggle}
  />
  <text class="sc-tile-caption">
    The swatch reads var(--lab-accent): violet from the :root token, amber once
    the surface writes its own. The readout is getComputedVariable.
  </text>
  <PrecedenceTile />
</view>
