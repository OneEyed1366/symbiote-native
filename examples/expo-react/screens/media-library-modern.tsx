import { useRef, useState } from 'react';
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
  usePermissions,
} from '@symbiote-native/media-library';
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

function PermissionCards() {
  const [isWriteOnly, setIsWriteOnly] = useState(false);
  const [state] = usePermissions({ writeOnly: isWriteOnly });
  const granular = isWriteOnly ? undefined : ['photo' as const, 'video' as const];
  return (
    <>
      <Card testID="media-library-permissions-card" title="Permissions">
        <ToggleRow testID="media-library-write-only-switch" label="writeOnly" value={isWriteOnly} onChange={setIsWriteOnly} color={color} />
        <ResultRow
          testID="media-library-permission-hook"
          label="usePermissions"
          value={state === null ? 'loading…' : `${state.status}, access ${state.accessPrivileges ?? 'n/a'}`}
        />
      </Card>
      <CallConsole
        prefix="media-library-permission-calls"
        title="Permission calls"
        color={color}
        hint="granularPermissions (photo, video) only matter on Android 13+."
        calls={[
          { label: 'getPermissionsAsync', run: () => getPermissionsAsync(isWriteOnly, granular) },
          { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync(isWriteOnly, granular) },
          { label: 'presentPermissionsPicker', run: () => presentPermissionsPicker() },
        ]}
      />
    </>
  );
}

function QueryCards({ setAssetId }: { setAssetId: (id: string) => void }) {
  const [field, setField] = useState(AssetField.CREATION_TIME);
  const [operator, setOperator] = useState<IOperator>('gt');
  const [value, setValue] = useState('0');
  const [limit, setLimit] = useState('5');
  const [offset, setOffset] = useState('0');
  const [orderField, setOrderField] = useState(AssetField.CREATION_TIME);
  const [isAscending, setIsAscending] = useState(false);
  const [albumTitle, setAlbumTitle] = useState('');

  const build = async (): Promise<Query> => {
    const query = new Query();
    query[operator](field, Number(value));
    const max = optionalNumber(limit);
    if (max !== undefined) {
      query.limit(max);
    }
    query.offset(optionalNumber(offset) ?? 0);
    query.orderBy({ key: orderField, ascending: isAscending });
    if (albumTitle.trim() !== '') {
      const album = await Album.get(albumTitle.trim());
      if (album === null) {
        throw new Error(`no album titled ${albumTitle}`);
      }
      query.album(album);
    }
    return query;
  };

  return (
    <>
      <Card testID="media-library-query-card" title="Query builder">
        <ChoiceRow testID="media-library-field" label="filter field" options={FIELDS} value={field} onChange={setField} color={color} />
        <ChoiceRow testID="media-library-operator" label="operator (gt, gte, lt, lte)" options={OPERATORS.map(item => ({ label: item, value: item }))} value={operator} onChange={setOperator} color={color} />
        <Field testID="media-library-value-input" label="value" value={value} onChange={setValue} />
        <Field testID="media-library-limit-input" label="limit" value={limit} onChange={setLimit} />
        <Field testID="media-library-offset-input" label="offset" value={offset} onChange={setOffset} />
        <ChoiceRow testID="media-library-order-field" label="orderBy key" options={FIELDS} value={orderField} onChange={setOrderField} color={color} />
        <ToggleRow testID="media-library-ascending-switch" label="orderBy ascending" value={isAscending} onChange={setIsAscending} color={color} />
        <Field testID="media-library-album-title-input" label="album title (Query.album)" value={albumTitle} onChange={setAlbumTitle} />
        <text className="info-text">
          Field types: {Object.values(MediaType).join(', ')} for mediaType, and media subtypes {Object.values(MediaSubtype).join(', ')}.
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
              setAssetId(assets[0]?.id ?? '');
              return assets.map(asset => asset.id);
            },
          },
          { label: 'exeForMetadata', run: async () => (await build()).exeForMetadata() },
        ]}
      />
    </>
  );
}

function AssetCards({ assetId, setAssetId }: { assetId: string; setAssetId: (id: string) => void }) {
  const [filePath, setFilePath] = useState('');
  const [albumTitle, setAlbumTitle] = useState('');
  const asset = () => new Asset(required(assetId, 'asset id'));
  return (
    <>
      <Card testID="media-library-asset-card" title="Asset">
        <Field testID="media-library-asset-id-input" label="asset id" value={assetId} onChange={setAssetId} />
        <Field testID="media-library-file-input" label="file uri for Asset.create" value={filePath} onChange={setFilePath} placeholder="file:///…/photo.jpg" />
        <Field testID="media-library-create-album-input" label="album title (optional)" value={albumTitle} onChange={setAlbumTitle} />
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
              const album = albumTitle.trim() === '' ? undefined : (await Album.get(albumTitle.trim())) ?? undefined;
              const created = await Asset.create(required(filePath, 'file uri'), album);
              setAssetId(created.id);
              return created.id;
            },
          },
          { label: 'delete (instance)', run: () => asset().delete() },
          { label: 'Asset.delete', run: () => Asset.delete([asset()]) },
        ]}
      />
    </>
  );
}

function AlbumCards({ assetId }: { assetId: string }) {
  const [title, setTitle] = useState('Symbiote Canary');
  const [moveAssets, setMoveAssets] = useState(false);
  const album = async () => {
    const found = await Album.get(title);
    if (found === null) {
      throw new Error(`no album titled ${title}`);
    }
    return found;
  };
  return (
    <>
      <Card testID="media-library-album-card" title="Album">
        <Field testID="media-library-album-input" label="album title" value={title} onChange={setTitle} />
        <ToggleRow testID="media-library-move-switch" label="moveAssets (Album.create)" value={moveAssets} onChange={setMoveAssets} color={color} />
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
          { label: 'Album.create', run: async () => (await Album.create(title, [required(assetId, 'asset id')], moveAssets)).id },
          { label: 'add', run: async () => (await album()).add(new Asset(required(assetId, 'asset id'))) },
          { label: 'removeAssets', run: async () => (await album()).removeAssets([new Asset(required(assetId, 'asset id'))]) },
          { label: 'delete (album)', run: async () => (await album()).delete() },
          { label: 'Album.delete', run: async () => Album.delete([await album()]) },
        ]}
      />
    </>
  );
}

function ListenerCard() {
  const [isOn, setIsOn] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const subscription = useRef<ReturnType<typeof addListener> | null>(null);
  const toggle = (next: boolean) => {
    setIsOn(next);
    if (next) {
      subscription.current = addListener(event =>
        setLines(previous =>
          [`incremental ${event.hasIncrementalChanges}, +${event.insertedAssets?.length ?? 0} -${event.deletedAssets?.length ?? 0} ~${event.updatedAssets?.length ?? 0}`, ...previous].slice(0, MAX_LOGGED_EVENTS),
        ),
      );
    } else {
      subscription.current?.remove();
      removeAllListeners();
    }
  };
  return (
    <Card testID="media-library-listener-card" title="Change listener">
      <ToggleRow testID="media-library-listener-switch" label="addListener / removeAllListeners" value={isOn} onChange={toggle} color={color} />
      <text testID="media-library-listener-log" className="info-text">
        {lines.length === 0 ? 'no changes yet, edit the library in another app' : lines.join('\n')}
      </text>
    </Card>
  );
}

export function ModernCards() {
  const [assetId, setAssetId] = useState('');
  return (
    <>
      <PermissionCards />
      <QueryCards setAssetId={setAssetId} />
      <AssetCards assetId={assetId} setAssetId={setAssetId} />
      <AlbumCards assetId={assetId} />
      <ListenerCard />
    </>
  );
}
