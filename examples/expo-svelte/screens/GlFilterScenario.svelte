<script lang="ts">
  import { Asset } from '@symbiote-native/asset';
  import { GLView } from '@symbiote-native/gl/svelte';
  import type { IExpoWebGLRenderingContext } from '@symbiote-native/gl/svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { FILTERS, errorLine } from './gl-frame-loop';
  import { filterScene } from './gl-shaders';
  import type { IFilterScene } from './gl-shaders';
  import { photoUrl } from './image-assets';

  const { color }: { color: string } = $props();

  let scene: IFilterScene | null = null;
  let filter = $state(0);
  let asset = $state.raw<Asset | null>(null);
  let line = $state('downloading the photo…');

  async function download(): Promise<void> {
    try {
      asset = await Asset.fromURI(photoUrl('1025', 512)).downloadAsync();
      line = 'photo ready';
    } catch (error: unknown) {
      line = `failed: ${errorLine(error)}`;
    }
  }
  void download();

  // The read comes first, `scene?.draw(filter)` skips it while `scene` is null
  $effect(() => {
    const current = filter;
    scene?.draw(current);
  });

  function onContextCreate(gl: IExpoWebGLRenderingContext): void {
    try {
      scene = filterScene(gl, asset);
      scene.draw(filter);
    } catch (error: unknown) {
      line = `failed: ${errorLine(error)}`;
    }
  }
</script>

<Scenario
  testID="gl-filter-scenario"
  title="Apply a photo filter on the GPU"
  why="Photo editors upload the picture as a texture and a shader recolors every pixel at once, so a filter changes the preview instantly even on a large image."
  steps={['Wait until the photo is ready', 'Press grey, sepia, invert and original in turn']}
  expect="The picture is redrawn at once for every filter: grey is monochrome, sepia is warm brown, invert flips every color, original returns the photo."
>
  <ResultRow testID="gl-filter-status" label="Photo" value={line} />
  {#if asset !== null}
    {#key asset.uri}
      <GLView testID="gl-filter" class="gl-view" {onContextCreate} />
    {/key}
  {/if}
  <ChoiceRow testID="gl-filter-choice" label="filter" {color} value={filter} options={FILTERS} onChange={value => (filter = value)} />
</Scenario>
