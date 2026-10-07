<script lang="ts">
  import { getAvailableVideoCodecsAsync } from '@symbiote-native/camera/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Explorer from '../components/Explorer.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import type { ICameraDeck } from './camera-shared';

  let { deck = $bindable(), color }: { deck: ICameraDeck; color: string } = $props();
</script>

<Explorer testID="camera-explorer" {color}>
  <ToggleRow testID="camera-active" label="active: the session runs (iOS)" value={deck.settings.isActive} onChange={value => (deck.settings.isActive = value)} {color} />
  <CallConsole
    prefix="camera-calls"
    title="Handle calls"
    {color}
    hint="Each call runs on the live preview above."
    calls={[
      { label: 'getAvailablePictureSizesAsync', run: async () => deck.camera?.getAvailablePictureSizesAsync() },
      { label: 'getAvailableLensesAsync', run: async () => deck.camera?.getAvailableLensesAsync() },
      { label: 'getSupportedFeatures', run: async () => deck.camera?.getSupportedFeatures() },
      { label: 'getAvailableVideoCodecsAsync', run: getAvailableVideoCodecsAsync },
      { label: 'pausePreview', run: async () => deck.camera?.pausePreview() },
      { label: 'resumePreview', run: async () => deck.camera?.resumePreview() },
    ]}
  />
</Explorer>
