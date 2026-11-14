<script lang="ts">
  import { onDestroy } from 'svelte';
  import { setVariable, useRootTag } from '@symbiote-native/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { LINE_COLOR } from '../../navigation-lines';

  const PRECEDENCE_NAME = '--lab-prec';
  const PRECEDENCE_SURFACE_VALUE = '#f72585';

  // The swatch declares the token itself while the first button is on, and the surface writes its
  // own while the second is on. Only the pixels tell which of the two, and :root, the swatch took
  const surface = useRootTag();
  let hasNodeValue = $state(false);
  let hasSurfaceValue = $state(false);

  onDestroy(() => setVariable(surface, PRECEDENCE_NAME, undefined));

  function onSurface() {
    setVariable(
      surface,
      PRECEDENCE_NAME,
      hasSurfaceValue ? undefined : PRECEDENCE_SURFACE_VALUE,
    );
    hasSurfaceValue = !hasSurfaceValue;
  }
</script>

<text class="sc-tile-label">A NODE VALUE, THE SURFACE'S, :root</text>
<view
  class={hasNodeValue ? 'lab-prec-swatch lab-prec-node' : 'lab-prec-swatch'}
  testID="lab-prec-swatch"
/>
<ActionButton
  testID="lab-prec-node-toggle"
  title={hasNodeValue ? 'Drop the node value' : 'Declare on the node'}
  color={LINE_COLOR.styling}
  onPress={() => (hasNodeValue = !hasNodeValue)}
/>
<ActionButton
  testID="lab-prec-surface-toggle"
  title={hasSurfaceValue ? 'Drop the surface value' : 'Write to the surface'}
  color={LINE_COLOR.styling}
  onPress={onSurface}
/>
<text class="sc-tile-caption">
  Cyan from the :root token, pink once the surface writes it, lime once the
  node declares it. Each drop falls back to the next one down.
</text>
