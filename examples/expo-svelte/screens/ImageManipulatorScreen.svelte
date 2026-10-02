<script lang="ts">
  import { manipulate, manipulateAsync } from '@symbiote-native/image-manipulator/svelte';
  import type {
    IImageManipulatorContext,
    IImageResult,
  } from '@symbiote-native/image-manipulator/svelte';
  import { launchImageLibraryAsync } from '@symbiote-native/image-picker/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { INITIAL_OPS, applyActions, toActions, toSaveOptions } from './image-manipulator-ops';
  import type { IOps } from './image-manipulator-ops';
  import ImageManipulatorHookRunner from './ImageManipulatorHookRunner.svelte';
  import ImageManipulatorOps from './ImageManipulatorOps.svelte';
  import ImageManipulatorResult from './ImageManipulatorResult.svelte';

  const ROUTE = ROUTE_NAME.ImageManipulator;
  const color = lineColorOf(ROUTE);

  let source = $state('');
  let ops = $state<IOps>({ ...INITIAL_OPS });
  let status = $state('pick a source image first');
  let result = $state<IImageResult | null>(null);

  function setOps(patch: Partial<IOps>): void {
    Object.assign(ops, patch);
  }

  function fail(error: Error): void {
    status = `failed: ${error.message}`;
  }

  const done =
    (label: string) =>
    (saved: IImageResult): void => {
      result = saved;
      status = label;
    };

  function pickSource(): void {
    launchImageLibraryAsync({ mediaTypes: ['images'] })
      .then(picked => {
        if (!picked.canceled) {
          source = picked.assets[0].uri;
          status = 'source ready';
        }
      })
      .catch(fail);
  }

  function runChain(): void {
    status = 'manipulate()…';
    applyActions(manipulate(source), toActions(ops))
      .renderAsync()
      .then(image => image.saveAsync(toSaveOptions(ops)))
      .then(done('manipulate().renderAsync().saveAsync()'))
      .catch(fail);
  }

  function runLegacy(): void {
    status = 'manipulateAsync()…';
    manipulateAsync(source, toActions(ops), toSaveOptions(ops))
      .then(done('manipulateAsync()'))
      .catch(fail);
  }

  function runHook(context: IImageManipulatorContext): void {
    status = 'hook context…';
    applyActions(context, toActions(ops))
      .renderAsync()
      .then(image => image.saveAsync(toSaveOptions(ops)))
      .then(done('useImageManipulator().renderAsync().saveAsync()'))
      .catch(fail);
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="image-manipulator-scroll"
  title="Image Manipulator"
  body="Edit a photo on the device before it goes anywhere: resize, rotate, flip, crop and re-compress as JPEG, PNG or WEBP. Smaller uploads, no server round trip."
>
  <Scenario
    testID="image-manipulator-source-card"
    title="Shrink and straighten a photo before upload"
    why="Phone photos are huge. Resize to 300 px wide and rotate a quarter turn on the device, so the upload is small and upright."
    steps={['Press Pick image and choose a photo', 'Press manipulate() chain', 'Compare the result size with the original']}
    expect="The result below is 300 px wide and rotated 90 degrees, with its new file URI. The deprecated manipulateAsync gives the same picture."
  >
    <ActionButton testID="image-manipulator-pick-button" title="Pick image (image-picker)" onPress={pickSource} {color} />
    <Field
      testID="image-manipulator-source-input"
      label="source uri"
      value={source}
      onChange={next => {
        source = next;
      }}
      placeholder="file:///…"
    />
    <ActionButton testID="image-manipulator-chain-button" title="manipulate() chain" onPress={runChain} {color} />
    <ActionButton testID="image-manipulator-legacy-button" title="manipulateAsync() (deprecated)" onPress={runLegacy} {color} />
    {#if source !== ''}
      <ImageManipulatorHookRunner {source} {color} run={runHook} />
    {/if}
    <ResultRow testID="image-manipulator-status" label="Status" value={status} />
    {#if result}
      <ImageManipulatorResult {result} />
    {/if}
  </Scenario>
  <Explorer testID="image-manipulator-explorer" {color}>
    <ImageManipulatorOps {ops} {setOps} {color} />
  </Explorer>
</ScreenShell>
