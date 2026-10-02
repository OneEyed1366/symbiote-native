<script lang="ts">
  import * as Legacy from '@symbiote-native/media-library/legacy';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import {
    INITIAL_ASSETS_FORM,
    MEDIA_TYPES,
    SORT_KEYS,
    toAssetsOptions,
    toChoices,
  } from './media-library-legacy-form';
  import type { IAssetsForm } from './media-library-legacy-form';
  import { required } from './media-library-helpers';

  const color = lineColorOf(ROUTE_NAME.MediaLibrary);

  let form = $state<IAssetsForm>({ ...INITIAL_ASSETS_FORM });
  let assetId = $state('');
  let albumId = $state('');
  let localUri = $state('');
  let albumName = $state('Symbiote Legacy');
  let includeSmart = $state(false);
  let shouldDownload = $state(true);
  let isCopy = $state(true);
  let isListening = $state(false);
  let subscription: ReturnType<typeof Legacy.addListener> | null = null;

  const asset = (): string => required(assetId, 'asset id');
  const album = (): string => required(albumId, 'album id');
  const uri = (): string => required(localUri, 'localUri');

  function toggleListener(next: boolean): void {
    isListening = next;
    if (next) {
      subscription = Legacy.addListener(() => undefined);
    } else {
      subscription?.remove();
      Legacy.removeAllListeners();
    }
  }
</script>

<Card testID="media-library-legacy-assets-card" title="getAssetsAsync options">
  <Field testID="media-library-first-input" label="first" value={form.first} onChange={first => (form.first = first)} />
  <Field testID="media-library-after-input" label="after (asset id)" value={form.after} onChange={after => (form.after = after)} />
  <Field testID="media-library-legacy-album-input" label="album (id)" value={form.album} onChange={next => (form.album = next)} />
  <ChoiceRow testID="media-library-sort-by" label="sortBy (SortBy key)" options={toChoices(SORT_KEYS)} value={form.sortBy} onChange={sortBy => (form.sortBy = sortBy)} {color} />
  <ToggleRow testID="media-library-sort-asc-switch" label="sortBy ascending" value={form.isAscending} onChange={isAscending => (form.isAscending = isAscending)} {color} />
  <ChoiceRow testID="media-library-legacy-media-type" label="mediaType (MediaType)" options={toChoices(MEDIA_TYPES)} value={form.mediaType} onChange={mediaType => (form.mediaType = mediaType)} {color} />
  <Field testID="media-library-subtypes-input" label="mediaSubtypes (comma separated, iOS)" value={form.mediaSubtypes} onChange={mediaSubtypes => (form.mediaSubtypes = mediaSubtypes)} />
  <Field testID="media-library-after-date-input" label="createdAfter (ms)" value={form.createdAfter} onChange={createdAfter => (form.createdAfter = createdAfter)} />
  <Field testID="media-library-before-date-input" label="createdBefore (ms)" value={form.createdBefore} onChange={createdBefore => (form.createdBefore = createdBefore)} />
  <ToggleRow testID="media-library-full-info-switch" label="resolveWithFullInfo" value={form.resolveWithFullInfo} onChange={resolveWithFullInfo => (form.resolveWithFullInfo = resolveWithFullInfo)} {color} />
</Card>
<Card testID="media-library-legacy-ids-card" title="Legacy ids and flags">
  <Field testID="media-library-legacy-asset-input" label="asset id" value={assetId} onChange={next => (assetId = next)} />
  <Field testID="media-library-legacy-album-id-input" label="album id" value={albumId} onChange={next => (albumId = next)} />
  <Field testID="media-library-legacy-uri-input" label="localUri for createAssetAsync and saveToLibraryAsync" value={localUri} onChange={next => (localUri = next)} />
  <Field testID="media-library-legacy-album-name-input" label="albumName for createAlbumAsync" value={albumName} onChange={next => (albumName = next)} />
  <ToggleRow testID="media-library-smart-switch" label="includeSmartAlbums" value={includeSmart} onChange={next => (includeSmart = next)} {color} />
  <ToggleRow testID="media-library-download-switch" label="shouldDownloadFromNetwork" value={shouldDownload} onChange={next => (shouldDownload = next)} {color} />
  <ToggleRow testID="media-library-copy-switch" label="copy (addAssetsToAlbumAsync, createAlbumAsync)" value={isCopy} onChange={next => (isCopy = next)} {color} />
  <ToggleRow testID="media-library-legacy-listener-switch" label="addListener / removeAllListeners" value={isListening} onChange={toggleListener} {color} />
</Card>
<CallConsole
  prefix="media-library-legacy-calls"
  title="Legacy function API"
  {color}
  calls={[
    { label: 'isAvailableAsync', run: () => Legacy.isAvailableAsync() },
    { label: 'getPermissionsAsync', run: () => Legacy.getPermissionsAsync() },
    { label: 'requestPermissionsAsync', run: () => Legacy.requestPermissionsAsync() },
    { label: 'presentPermissionsPickerAsync', run: () => Legacy.presentPermissionsPickerAsync() },
    {
      label: 'getAssetsAsync',
      run: async () => {
        const page = await Legacy.getAssetsAsync(toAssetsOptions(form));
        assetId = page.assets[0]?.id ?? assetId;
        return {
          total: page.totalCount,
          hasNextPage: page.hasNextPage,
          endCursor: page.endCursor,
          ids: page.assets.map(item => item.id),
        };
      },
    },
    {
      label: 'getAssetInfoAsync',
      run: () => Legacy.getAssetInfoAsync(asset(), { shouldDownloadFromNetwork: shouldDownload }),
    },
    { label: 'getAssetContentUriAsync (Android)', run: () => Legacy.getAssetContentUriAsync(asset()) },
    { label: 'setAssetFavoriteAsync (iOS)', run: () => Legacy.setAssetFavoriteAsync(asset(), true) },
    { label: 'createAssetAsync', run: async () => (await Legacy.createAssetAsync(uri())).id },
    { label: 'saveToLibraryAsync', run: () => Legacy.saveToLibraryAsync(uri()) },
    { label: 'deleteAssetsAsync', run: () => Legacy.deleteAssetsAsync([asset()]) },
    {
      label: 'getAlbumsAsync',
      run: async () => {
        const albums = await Legacy.getAlbumsAsync({ includeSmartAlbums: includeSmart });
        albumId = albums[0]?.id ?? albumId;
        return albums.map(item => ({ id: item.id, title: item.title, count: item.assetCount }));
      },
    },
    { label: 'getAlbumAsync', run: () => Legacy.getAlbumAsync(albumName) },
    {
      label: 'createAlbumAsync',
      run: async () => {
        const created = await Legacy.createAlbumAsync(
          albumName,
          asset(),
          isCopy,
          localUri.trim() === '' ? undefined : localUri.trim(),
        );
        albumId = created.id;
        return created.id;
      },
    },
    {
      label: 'addAssetsToAlbumAsync',
      run: () => Legacy.addAssetsToAlbumAsync([asset()], album(), isCopy),
    },
    {
      label: 'removeAssetsFromAlbumAsync',
      run: () => Legacy.removeAssetsFromAlbumAsync([asset()], album()),
    },
    { label: 'deleteAlbumsAsync', run: () => Legacy.deleteAlbumsAsync([album()]) },
    { label: 'getMomentsAsync (iOS)', run: () => Legacy.getMomentsAsync() },
    { label: 'albumNeedsMigrationAsync (iOS)', run: () => Legacy.albumNeedsMigrationAsync(album()) },
    {
      label: 'migrateAlbumIfNeededAsync (iOS)',
      run: () => Legacy.migrateAlbumIfNeededAsync(album()),
    },
    {
      label: 'MediaType and SortBy constants',
      run: async () => ({ MediaType: Legacy.MediaType, SortBy: Legacy.SortBy }),
    },
  ]}
/>
