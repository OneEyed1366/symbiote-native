import { defineComponent, onUnmounted, ref, watch } from 'vue';
import {
  Album,
  Asset,
  AssetField,
  MediaSubtype,
  MediaType,
  Query,
  addListener,
  getPermissionsAsync,
  presentPermissionsPicker,
  removeAllListeners,
  requestPermissionsAsync,
} from '@symbiote-native/media-library/vue';
import type { IMediaLibraryNextPermissionResponse } from '@symbiote-native/media-library/vue';
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  ChoiceRow,
  Field,
  ResultRow,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.MediaLibrary);
const MAX_LOGGED_EVENTS = 6;
const FIELDS = Object.values(AssetField).map(value => ({ label: value, value }));
const OPERATORS = ['gt', 'gte', 'lt', 'lte'] as const;
type IOperator = (typeof OPERATORS)[number];

function required(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first`);
  }
  return text.trim();
}

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

const PermissionCards = defineComponent(
  () => {
    const isWriteOnly = ref(false);
    const state = ref<IMediaLibraryNextPermissionResponse | null>(null);
    const granular = () => (isWriteOnly.value ? undefined : ['photo' as const, 'video' as const]);

    // Reloads the status whenever `writeOnly` flips, ignoring a stale answer
    watch(
      isWriteOnly,
      (writeOnly, _previous, onCleanup) => {
        let isStale = false;
        state.value = null;
        getPermissionsAsync(writeOnly, writeOnly ? undefined : ['photo', 'video']).then(response => {
          if (!isStale) {
            state.value = response;
          }
        });
        onCleanup(() => {
          isStale = true;
        });
      },
      { immediate: true },
    );

    return () => (
      <>
        <Card testID="media-library-permissions-card" title="Permissions">
          <ToggleRow testID="media-library-write-only-switch" label="writeOnly" value={isWriteOnly.value} onChange={next => { isWriteOnly.value = next; }} color={color} />
          <ResultRow
            testID="media-library-permission-hook"
            label="usePermissions"
            value={state.value === null ? 'loading…' : `${state.value.status}, access ${state.value.accessPrivileges ?? 'n/a'}`}
          />
        </Card>
        <CallConsole
          prefix="media-library-permission-calls"
          title="Permission calls"
          color={color}
          hint="granularPermissions (photo, video) only matter on Android 13+."
          calls={[
            { label: 'getPermissionsAsync', run: () => getPermissionsAsync(isWriteOnly.value, granular()) },
            { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync(isWriteOnly.value, granular()) },
            { label: 'presentPermissionsPicker', run: () => presentPermissionsPicker() },
          ]}
        />
      </>
    );
  },
  { name: 'PermissionCards' },
);

const QueryCards = defineComponent<{ setAssetId: (id: string) => void }>(
  props => {
    const field = ref(AssetField.CREATION_TIME);
    const operator = ref<IOperator>('gt');
    const value = ref('0');
    const limit = ref('5');
    const offset = ref('0');
    const orderField = ref(AssetField.CREATION_TIME);
    const isAscending = ref(false);
    const albumTitle = ref('');

    const build = async (): Promise<Query> => {
      const query = new Query();
      query[operator.value](field.value, Number(value.value));
      const max = optionalNumber(limit.value);
      if (max !== undefined) {
        query.limit(max);
      }
      query.offset(optionalNumber(offset.value) ?? 0);
      query.orderBy({ key: orderField.value, ascending: isAscending.value });
      if (albumTitle.value.trim() !== '') {
        const album = await Album.get(albumTitle.value.trim());
        if (album === null) {
          throw new Error(`no album titled ${albumTitle.value}`);
        }
        query.album(album);
      }
      return query;
    };

    return () => (
      <>
        <Card testID="media-library-query-card" title="Query builder">
          <ChoiceRow testID="media-library-field" label="filter field" options={FIELDS} value={field.value} onChange={next => { field.value = next; }} color={color} />
          <ChoiceRow testID="media-library-operator" label="operator (gt, gte, lt, lte)" options={OPERATORS.map(item => ({ label: item, value: item }))} value={operator.value} onChange={next => { operator.value = next; }} color={color} />
          <Field testID="media-library-value-input" label="value" value={value.value} onChange={next => { value.value = next; }} />
          <Field testID="media-library-limit-input" label="limit" value={limit.value} onChange={next => { limit.value = next; }} />
          <Field testID="media-library-offset-input" label="offset" value={offset.value} onChange={next => { offset.value = next; }} />
          <ChoiceRow testID="media-library-order-field" label="orderBy key" options={FIELDS} value={orderField.value} onChange={next => { orderField.value = next; }} color={color} />
          <ToggleRow testID="media-library-ascending-switch" label="orderBy ascending" value={isAscending.value} onChange={next => { isAscending.value = next; }} color={color} />
          <Field testID="media-library-album-title-input" label="album title (Query.album)" value={albumTitle.value} onChange={next => { albumTitle.value = next; }} />
          <text class="info-text">
            {`Field types: ${Object.values(MediaType).join(', ')} for mediaType, and media subtypes ${Object.values(MediaSubtype).join(', ')}.`}
          </text>
        </Card>
        <CallConsole
          prefix="media-library-query-calls"
          title="Query results"
          color={color}
          calls={[
            {
              label: 'exe',
              run: async () => {
                const assets = await (await build()).exe();
                props.setAssetId(assets[0]?.id ?? '');
                return assets.map(asset => asset.id);
              },
            },
            { label: 'exeForMetadata', run: async () => (await build()).exeForMetadata() },
          ]}
        />
      </>
    );
  },
  { name: 'QueryCards', props: ['setAssetId'] },
);

const AssetCards = defineComponent<{ assetId: string; setAssetId: (id: string) => void }>(
  props => {
    const filePath = ref('');
    const albumTitle = ref('');
    const asset = () => new Asset(required(props.assetId, 'asset id'));
    return () => (
      <>
        <Card testID="media-library-asset-card" title="Asset">
          <Field testID="media-library-asset-id-input" label="asset id" value={props.assetId} onChange={props.setAssetId} />
          <Field testID="media-library-file-input" label="file uri for Asset.create" value={filePath.value} onChange={next => { filePath.value = next; }} placeholder="file:///…/photo.jpg" />
          <Field testID="media-library-create-album-input" label="album title (optional)" value={albumTitle.value} onChange={next => { albumTitle.value = next; }} />
        </Card>
        <CallConsole
          prefix="media-library-asset-getters"
          title="Asset getters"
          color={color}
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
            { label: 'getAlbums', run: async () => Promise.all((await asset().getAlbums()).map(async item => ({ id: item.id, title: await item.getTitle() }))) },
            { label: 'getFavorite (iOS)', run: () => asset().getFavorite() },
          ]}
        />
        <CallConsole
          prefix="media-library-asset-actions"
          title="Asset actions"
          color={color}
          hint="Asset.create saves a file into the library, delete removes it for good."
          calls={[
            { label: 'setFavorite (iOS)', run: () => asset().setFavorite(true) },
            {
              label: 'Asset.create',
              run: async () => {
                const album = albumTitle.value.trim() === '' ? undefined : (await Album.get(albumTitle.value.trim())) ?? undefined;
                const created = await Asset.create(required(filePath.value, 'file uri'), album);
                props.setAssetId(created.id);
                return created.id;
              },
            },
            { label: 'delete (instance)', run: () => asset().delete() },
            { label: 'Asset.delete', run: () => Asset.delete([asset()]) },
          ]}
        />
      </>
    );
  },
  { name: 'AssetCards', props: ['assetId', 'setAssetId'] },
);

const AlbumCards = defineComponent<{ assetId: string }>(
  props => {
    const title = ref('Symbiote Canary');
    const moveAssets = ref(false);
    const album = async () => {
      const found = await Album.get(title.value);
      if (found === null) {
        throw new Error(`no album titled ${title.value}`);
      }
      return found;
    };
    return () => (
      <>
        <Card testID="media-library-album-card" title="Album">
          <Field testID="media-library-album-input" label="album title" value={title.value} onChange={next => { title.value = next; }} />
          <ToggleRow testID="media-library-move-switch" label="moveAssets (Album.create)" value={moveAssets.value} onChange={next => { moveAssets.value = next; }} color={color} />
        </Card>
        <CallConsole
          prefix="media-library-album-calls"
          title="Album calls"
          color={color}
          calls={[
            { label: 'Album.getAll', run: async () => Promise.all((await Album.getAll()).map(async item => ({ id: item.id, title: await item.getTitle() }))) },
            { label: 'Album.get', run: async () => (await album()).id },
            { label: 'getTitle', run: async () => (await album()).getTitle() },
            { label: 'getAssets', run: async () => (await (await album()).getAssets()).map(item => item.id) },
            { label: 'Album.create', run: async () => (await Album.create(title.value, [required(props.assetId, 'asset id')], moveAssets.value)).id },
            { label: 'add', run: async () => (await album()).add(new Asset(required(props.assetId, 'asset id'))) },
            { label: 'removeAssets', run: async () => (await album()).removeAssets([new Asset(required(props.assetId, 'asset id'))]) },
            { label: 'delete (album)', run: async () => (await album()).delete() },
            { label: 'Album.delete', run: async () => Album.delete([await album()]) },
          ]}
        />
      </>
    );
  },
  { name: 'AlbumCards', props: ['assetId'] },
);

const ListenerCard = defineComponent(
  () => {
    const isOn = ref(false);
    const lines = ref<string[]>([]);
    let subscription: ReturnType<typeof addListener> | null = null;

    onUnmounted(() => {
      subscription?.remove();
    });

    const toggle = (next: boolean) => {
      isOn.value = next;
      if (next) {
        subscription = addListener(event => {
          lines.value = [
            `incremental ${event.hasIncrementalChanges}, +${event.insertedAssets?.length ?? 0} -${event.deletedAssets?.length ?? 0} ~${event.updatedAssets?.length ?? 0}`,
            ...lines.value,
          ].slice(0, MAX_LOGGED_EVENTS);
        });
      } else {
        subscription?.remove();
        removeAllListeners();
      }
    };

    return () => (
      <Card testID="media-library-listener-card" title="Change listener">
        <ToggleRow testID="media-library-listener-switch" label="addListener / removeAllListeners" value={isOn.value} onChange={toggle} color={color} />
        <text testID="media-library-listener-log" class="info-text">
          {lines.value.length === 0 ? 'no changes yet, edit the library in another app' : lines.value.join('\n')}
        </text>
      </Card>
    );
  },
  { name: 'ListenerCard' },
);

export const ModernCards = defineComponent(
  () => {
    const assetId = ref('');
    const setAssetId = (next: string) => {
      assetId.value = next;
    };
    return () => (
      <>
        <PermissionCards />
        <QueryCards setAssetId={setAssetId} />
        <AssetCards assetId={assetId.value} setAssetId={setAssetId} />
        <AlbumCards assetId={assetId.value} />
        <ListenerCard />
      </>
    );
  },
  { name: 'ModernCards' },
);
