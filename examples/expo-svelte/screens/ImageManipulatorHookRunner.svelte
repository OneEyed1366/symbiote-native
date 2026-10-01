<script lang="ts">
  import { useImageManipulator } from '@symbiote-native/image-manipulator/svelte';
  import type { IImageManipulatorContext } from '@symbiote-native/image-manipulator/svelte';
  import ActionButton from '../components/ActionButton.svelte';

  let {
    source,
    color,
    run,
  }: {
    source: string;
    color: string;
    run: (context: IImageManipulatorContext) => void;
  } = $props();

  const context = useImageManipulator(() => source);
</script>

<view class="button-row">
  <ActionButton
    testID="image-manipulator-hook-button"
    title="useImageManipulator context"
    onPress={() => run(context.current)}
    {color}
  />
  <ActionButton
    testID="image-manipulator-reset-button"
    title="context.reset()"
    onPress={() => context.current.reset()}
    {color}
  />
</view>
