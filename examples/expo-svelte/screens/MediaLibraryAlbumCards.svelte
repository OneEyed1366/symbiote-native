<script lang="ts">
  import { Album, Asset } from '@symbiote-native/media-library/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { required } from './media-library-helpers';

  let { assetId }: { assetId: string } = $props();

  const color = lineColorOf(ROUTE_NAME.MediaLibrary);

  let title = $state('Symbiote Canary');
  let moveAssets = $state(false);

  async function album() {
    const found = await Album.get(title);
    if (found === null) {
      throw new Error(`no album titled ${title}`);
    }
    return found;
  }
</script>

<Card testID="media-library-album-card" title="Album">
  <Field testID="media-library-album-input" label="album title" value={title} onChange={next => (title = next)} />
  <ToggleRow testID="media-library-move-switch" label="moveAssets (Album.create)" value={moveAssets} onChange={next => (moveAssets = next)} {color} />
</Card>
<CallConsole
  prefix="media-library-album-calls"
  title="Album calls"
  {color}
  calls={[
    {
      label: 'Album.getAll',
      run: async () =>
        Promise.all(
          (await Album.getAll()).map(async item => ({ id: item.id, title: await item.getTitle() })),
        ),
    },
    { label: 'Album.get', run: async () => (await album()).id },
    { label: 'getTitle', run: async () => (await album()).getTitle() },
    { label: 'getAssets', run: async () => (await (await album()).getAssets()).map(item => item.id) },
    {
      label: 'Album.create',
      run: async () => (await Album.create(title, [required(assetId, 'asset id')], moveAssets)).id,
    },
    {
      label: 'add',
      run: async () => (await album()).add(new Asset(required(assetId, 'asset id'))),
    },
    {
      label: 'removeAssets',
      run: async () => (await album()).removeAssets([new Asset(required(assetId, 'asset id'))]),
    },
    { label: 'delete (album)', run: async () => (await album()).delete() },
    { label: 'Album.delete', run: async () => Album.delete([await album()]) },
  ]}
/>
