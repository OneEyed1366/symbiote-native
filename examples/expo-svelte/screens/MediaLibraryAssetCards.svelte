<script lang="ts">
  import { Album, Asset } from '@symbiote-native/media-library/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { required } from './media-library-helpers';

  let {
    assetId,
    setAssetId,
  }: { assetId: string; setAssetId: (id: string) => void } = $props();

  const color = lineColorOf(ROUTE_NAME.MediaLibrary);

  let filePath = $state('');
  let albumTitle = $state('');

  const asset = (): Asset => new Asset(required(assetId, 'asset id'));
</script>

<Card testID="media-library-asset-card" title="Asset">
  <Field testID="media-library-asset-id-input" label="asset id" value={assetId} onChange={setAssetId} />
  <Field testID="media-library-file-input" label="file uri for Asset.create" value={filePath} onChange={next => (filePath = next)} placeholder="file:///…/photo.jpg" />
  <Field testID="media-library-create-album-input" label="album title (optional)" value={albumTitle} onChange={next => (albumTitle = next)} />
</Card>
<CallConsole
  prefix="media-library-asset-getters"
  title="Asset getters"
  {color}
  calls={[
    { label: 'getFilename', run: () => asset().getFilename() },
    { label: 'getUri', run: () => asset().getUri() },
    { label: 'getMediaType', run: () => asset().getMediaType() },
    { label: 'getMediaSubtypes', run: () => asset().getMediaSubtypes() },
    { label: 'getWidth', run: () => asset().getWidth() },
    { label: 'getHeight', run: () => asset().getHeight() },
    { label: 'getShape', run: () => asset().getShape() },
    { label: 'getDuration', run: () => asset().getDuration() },
    { label: 'getCreationTime', run: () => asset().getCreationTime() },
    { label: 'getModificationTime', run: () => asset().getModificationTime() },
    { label: 'getOrientation (iOS)', run: () => asset().getOrientation() },
    { label: 'getIsInCloud (iOS)', run: () => asset().getIsInCloud() },
    { label: 'getLivePhotoVideoUri (iOS)', run: () => asset().getLivePhotoVideoUri() },
    { label: 'getLocation', run: () => asset().getLocation() },
    { label: 'getExif', run: () => asset().getExif() },
    { label: 'getInfo', run: () => asset().getInfo() },
    {
      label: 'getAlbums',
      run: async () =>
        Promise.all(
          (await asset().getAlbums()).map(async item => ({ id: item.id, title: await item.getTitle() })),
        ),
    },
    { label: 'getFavorite (iOS)', run: () => asset().getFavorite() },
  ]}
/>
<CallConsole
  prefix="media-library-asset-actions"
  title="Asset actions"
  {color}
  hint="Asset.create saves a file into the library, delete removes it for good."
  calls={[
    { label: 'setFavorite (iOS)', run: () => asset().setFavorite(true) },
    {
      label: 'Asset.create',
      run: async () => {
        const album =
          albumTitle.trim() === '' ? undefined : ((await Album.get(albumTitle.trim())) ?? undefined);
        const created = await Asset.create(required(filePath, 'file uri'), album);
        setAssetId(created.id);
        return created.id;
      },
    },
    { label: 'delete (instance)', run: () => asset().delete() },
    { label: 'Asset.delete', run: () => Asset.delete([asset()]) },
  ]}
/>
