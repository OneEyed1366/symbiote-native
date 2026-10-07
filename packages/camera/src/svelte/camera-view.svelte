<script lang="ts">
  // The native view name is mixed-case, which a literal tag would parse as a component reference,
  // so the tag is dynamic
  import { hostProps } from '@symbiote-native/svelte/native-view-bridge';
  import { useNativeViewController } from '@symbiote-native/svelte/runes/use-native-view-controller';
  import { createCameraView } from '../core';
  import type { ICameraViewProps } from '../core';

  const props: ICameraViewProps = $props();
  const view = useNativeViewController(createCameraView, () => ({ ...props }));

  // The functions of the view are instance members, `bind:this` reaches them
  export const takePictureAsync = view.handle.takePictureAsync;
  export const recordAsync = view.handle.recordAsync;
  export const toggleRecordingAsync = view.handle.toggleRecordingAsync;
  export const stopRecording = view.handle.stopRecording;
  export const pausePreview = view.handle.pausePreview;
  export const resumePreview = view.handle.resumePreview;
  export const getAvailablePictureSizesAsync =
    view.handle.getAvailablePictureSizesAsync;
  export const getAvailableLensesAsync = view.handle.getAvailableLensesAsync;
  export const getSupportedFeatures = view.handle.getSupportedFeatures;
  export const getHostNode = view.handle.getHostNode;
</script>

{#if view.descriptor}
  <svelte:element
    this={view.descriptor.type}
    {@attach view.attachHost}
    {@attach hostProps(view.descriptor.props)}
  />
{/if}
