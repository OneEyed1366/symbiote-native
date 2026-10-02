import { useRef, useState } from 'react';
import * as Legacy from '@symbiote-native/media-library/legacy';
import type {
  IMediaLibraryAssetsOptions,
  IMediaLibraryMediaSubtype,
  IMediaLibraryMediaTypeValue,
  IMediaLibrarySortByKey,
} from '@symbiote-native/media-library/legacy';
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  ChoiceRow,
  Field,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.MediaLibrary);
const MEDIA_TYPES: readonly IMediaLibraryMediaTypeValue[] = ['photo', 'video', 'audio', 'unknown'];
const SORT_KEYS: readonly IMediaLibrarySortByKey[] = ['default', 'mediaType', 'width', 'height', 'creationTime', 'modificationTime', 'duration'];
const NO_SORT = 'default';
const SUBTYPES: readonly IMediaLibraryMediaSubtype[] = [
  'depthEffect',
  'hdr',
  'highFrameRate',
  'livePhoto',
  'panorama',
  'screenshot',
  'stream',
  'timelapse',
  'spatialMedia',
  'videoCinematic',
];

function need(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first`);
  }
  return text.trim();
}

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function toChoices(values: readonly string[]) {
  return values.map(value => ({ label: value, value }));
}

type IAssetsForm = {
  first: string;
  after: string;
  album: string;
  sortBy: string;
  isAscending: boolean;
  mediaType: string;
  mediaSubtypes: string;
  createdAfter: string;
  createdBefore: string;
  resolveWithFullInfo: boolean;
};
type ISetAssets = (patch: Partial<IAssetsForm>) => void;

function toAssetsOptions(form: IAssetsForm): IMediaLibraryAssetsOptions {
  const requested = form.mediaSubtypes.split(',').map(item => item.trim());
  const subtypes = SUBTYPES.filter(subtype => requested.includes(subtype));
  const sortKey = SORT_KEYS.find(key => key === form.sortBy);
  return {
    first: optionalNumber(form.first),
    after: form.after.trim() === '' ? undefined : form.after.trim(),
    album: form.album.trim() === '' ? undefined : form.album.trim(),
    sortBy: sortKey === undefined || sortKey === NO_SORT ? undefined : [[sortKey, form.isAscending]],
    mediaType: MEDIA_TYPES.find(type => type === form.mediaType),
    mediaSubtypes: subtypes.length === 0 ? undefined : subtypes,
    createdAfter: optionalNumber(form.createdAfter),
    createdBefore: optionalNumber(form.createdBefore),
    resolveWithFullInfo: form.resolveWithFullInfo,
  };
}

function AssetsFormCard({ form, setForm }: { form: IAssetsForm; setForm: ISetAssets }) {
  return (
    <Card testID="media-library-legacy-assets-card" title="getAssetsAsync options">
      <Field testID="media-library-first-input" label="first" value={form.first} onChange={first => setForm({ first })} />
      <Field testID="media-library-after-input" label="after (asset id)" value={form.after} onChange={after => setForm({ after })} />
      <Field testID="media-library-legacy-album-input" label="album (id)" value={form.album} onChange={album => setForm({ album })} />
      <ChoiceRow testID="media-library-sort-by" label="sortBy (SortBy key)" options={toChoices(SORT_KEYS)} value={form.sortBy} onChange={sortBy => setForm({ sortBy })} color={color} />
      <ToggleRow testID="media-library-sort-asc-switch" label="sortBy ascending" value={form.isAscending} onChange={isAscending => setForm({ isAscending })} color={color} />
      <ChoiceRow testID="media-library-legacy-media-type" label="mediaType (MediaType)" options={toChoices(MEDIA_TYPES)} value={form.mediaType} onChange={mediaType => setForm({ mediaType })} color={color} />
      <Field testID="media-library-subtypes-input" label="mediaSubtypes (comma separated, iOS)" value={form.mediaSubtypes} onChange={mediaSubtypes => setForm({ mediaSubtypes })} />
      <Field testID="media-library-after-date-input" label="createdAfter (ms)" value={form.createdAfter} onChange={createdAfter => setForm({ createdAfter })} />
      <Field testID="media-library-before-date-input" label="createdBefore (ms)" value={form.createdBefore} onChange={createdBefore => setForm({ createdBefore })} />
      <ToggleRow testID="media-library-full-info-switch" label="resolveWithFullInfo" value={form.resolveWithFullInfo} onChange={resolveWithFullInfo => setForm({ resolveWithFullInfo })} color={color} />
    </Card>
  );
}

export function LegacyCards() {
  const [form, setFormState] = useState<IAssetsForm>({
    first: '5',
    after: '',
    album: '',
    sortBy: NO_SORT,
    isAscending: false,
    mediaType: 'photo',
    mediaSubtypes: '',
    createdAfter: '',
    createdBefore: '',
    resolveWithFullInfo: false,
  });
  const [assetId, setAssetId] = useState('');
  const [albumId, setAlbumId] = useState('');
  const [localUri, setLocalUri] = useState('');
  const [albumName, setAlbumName] = useState('Symbiote Legacy');
  const [includeSmart, setIncludeSmart] = useState(false);
  const [shouldDownload, setShouldDownload] = useState(true);
  const [isCopy, setIsCopy] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const subscription = useRef<ReturnType<typeof Legacy.addListener> | null>(null);
  const setForm: ISetAssets = patch => setFormState(previous => ({ ...previous, ...patch }));
  const asset = () => need(assetId, 'asset id');
  const album = () => need(albumId, 'album id');

  const toggleListener = (next: boolean) => {
    setIsListening(next);
    if (next) {
      subscription.current = Legacy.addListener(() => undefined);
    } else {
      subscription.current?.remove();
      Legacy.removeAllListeners();
    }
  };

  return (
    <>
      <AssetsFormCard form={form} setForm={setForm} />
      <Card testID="media-library-legacy-ids-card" title="Legacy ids and flags">
        <Field testID="media-library-legacy-asset-input" label="asset id" value={assetId} onChange={setAssetId} />
        <Field testID="media-library-legacy-album-id-input" label="album id" value={albumId} onChange={setAlbumId} />
        <Field testID="media-library-legacy-uri-input" label="localUri for createAssetAsync and saveToLibraryAsync" value={localUri} onChange={setLocalUri} />
        <Field testID="media-library-legacy-album-name-input" label="albumName for createAlbumAsync" value={albumName} onChange={setAlbumName} />
        <ToggleRow testID="media-library-smart-switch" label="includeSmartAlbums" value={includeSmart} onChange={setIncludeSmart} color={color} />
        <ToggleRow testID="media-library-download-switch" label="shouldDownloadFromNetwork" value={shouldDownload} onChange={setShouldDownload} color={color} />
        <ToggleRow testID="media-library-copy-switch" label="copy (addAssetsToAlbumAsync, createAlbumAsync)" value={isCopy} onChange={setIsCopy} color={color} />
        <ToggleRow testID="media-library-legacy-listener-switch" label="addListener / removeAllListeners" value={isListening} onChange={toggleListener} color={color} />
      </Card>
      <CallConsole
        prefix="media-library-legacy-calls"
        title="Legacy function API"
        color={color}
        calls={[
          { label: 'isAvailableAsync', run: () => Legacy.isAvailableAsync() },
          { label: 'getPermissionsAsync', run: () => Legacy.getPermissionsAsync() },
          { label: 'requestPermissionsAsync', run: () => Legacy.requestPermissionsAsync() },
          { label: 'presentPermissionsPickerAsync', run: () => Legacy.presentPermissionsPickerAsync() },
          {
            label: 'getAssetsAsync',
            run: async () => {
              const page = await Legacy.getAssetsAsync(toAssetsOptions(form));
              setAssetId(page.assets[0]?.id ?? assetId);
              return { total: page.totalCount, hasNextPage: page.hasNextPage, endCursor: page.endCursor, ids: page.assets.map(item => item.id) };
            },
          },
          { label: 'getAssetInfoAsync', run: () => Legacy.getAssetInfoAsync(asset(), { shouldDownloadFromNetwork: shouldDownload }) },
          { label: 'getAssetContentUriAsync (Android)', run: () => Legacy.getAssetContentUriAsync(asset()) },
          { label: 'setAssetFavoriteAsync (iOS)', run: () => Legacy.setAssetFavoriteAsync(asset(), true) },
          { label: 'createAssetAsync', run: async () => (await Legacy.createAssetAsync(need(localUri, 'localUri'))).id },
          { label: 'saveToLibraryAsync', run: () => Legacy.saveToLibraryAsync(need(localUri, 'localUri')) },
          { label: 'deleteAssetsAsync', run: () => Legacy.deleteAssetsAsync([asset()]) },
          {
            label: 'getAlbumsAsync',
            run: async () => {
              const albums = await Legacy.getAlbumsAsync({ includeSmartAlbums: includeSmart });
              setAlbumId(albums[0]?.id ?? albumId);
              return albums.map(item => ({ id: item.id, title: item.title, count: item.assetCount }));
            },
          },
          { label: 'getAlbumAsync', run: () => Legacy.getAlbumAsync(albumName) },
          {
            label: 'createAlbumAsync',
            run: async () => {
              const created = await Legacy.createAlbumAsync(albumName, asset(), isCopy, localUri.trim() === '' ? undefined : localUri.trim());
              setAlbumId(created.id);
              return created.id;
            },
          },
          { label: 'addAssetsToAlbumAsync', run: () => Legacy.addAssetsToAlbumAsync([asset()], album(), isCopy) },
          { label: 'removeAssetsFromAlbumAsync', run: () => Legacy.removeAssetsFromAlbumAsync([asset()], album()) },
          { label: 'deleteAlbumsAsync', run: () => Legacy.deleteAlbumsAsync([album()]) },
          { label: 'getMomentsAsync (iOS)', run: () => Legacy.getMomentsAsync() },
          { label: 'albumNeedsMigrationAsync (iOS)', run: () => Legacy.albumNeedsMigrationAsync(album()) },
          { label: 'migrateAlbumIfNeededAsync (iOS)', run: () => Legacy.migrateAlbumIfNeededAsync(album()) },
          { label: 'MediaType and SortBy constants', run: async () => ({ MediaType: Legacy.MediaType, SortBy: Legacy.SortBy }) },
        ]}
      />
    </>
  );
}
