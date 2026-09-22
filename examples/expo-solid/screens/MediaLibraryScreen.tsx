import { createSignal, onCleanup } from 'solid-js';
import { Platform } from '@symbiote-native/solid';
import {
  addListener,
  getAlbumsAsync,
  getAssetContentUriAsync,
  getAssetInfoAsync,
  getAssetsAsync,
  getMomentsAsync,
  getPermissionsAsync,
  presentPermissionsPickerAsync,
  requestPermissionsAsync,
  setAssetFavoriteAsync,
} from '@symbiote-native/media-library/legacy';
import type {
  IMediaLibraryAlbum,
  IMediaLibraryAsset,
  IMediaLibraryAssetInfo,
  IMediaLibraryAssetsChangeEvent,
  IMediaLibraryPagedInfo,
  IMediaLibraryPermissionResponse,
} from '@symbiote-native/media-library/legacy';
import {
  AssetField,
  Query,
  Album as ModernAlbum,
  requestPermissionsAsync as requestModernPermissionsAsync,
} from '@symbiote-native/media-library';
import type { Asset as IModernAsset } from '@symbiote-native/media-library';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const QUERY_RESULT_LIMIT = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatPermissionResponse(response: IMediaLibraryPermissionResponse): string {
  return `${response.status} · granted=${response.granted} · privileges=${response.accessPrivileges ?? 'n/a'}`;
}

function formatAssetInfo(info: IMediaLibraryAssetInfo): string {
  const parts: string[] = [];
  if (info.localUri) {
    parts.push(`localUri: ${info.localUri}`);
  }
  if (info.location) {
    parts.push(
      `location: ${info.location.latitude.toFixed(4)}, ${info.location.longitude.toFixed(4)}`,
    );
  }
  if (info.isFavorite !== undefined) {
    parts.push(`isFavorite: ${info.isFavorite}`);
  }
  if (info.orientation !== undefined) {
    parts.push(`orientation: ${info.orientation}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'no extra info on this platform';
}

/**
 * @symbiote-native/media-library canary demo: permissions (incl. the limited-access picker),
 * albums, a paged asset listing, per-asset detail + favorite toggle, an iOS moments / Android
 * content-URI card, and a live library-change listener. Deliberately READ-ONLY — it never
 * creates, saves, deletes, or picks an asset, only reads whatever already exists in the
 * simulator/device library. Most calls can legitimately reject with no permission granted yet -
 * shown inline as an error, not a bug.
 */
export function MediaLibraryScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.MediaLibrary];
  const lineColor = LINE_COLOR[lineInfo.line];

  let disposed = false;
  let mediaSubscription: ReturnType<typeof addListener> | null = null;
  onCleanup(() => {
    disposed = true;
    mediaSubscription?.remove();
    mediaSubscription = null;
  });

  const [permissionResponse, setPermissionResponse] =
    createSignal<IMediaLibraryPermissionResponse | null>(null);
  const [pickerError, setPickerError] = createSignal<string | null>(null);

  const [albums, setAlbums] = createSignal<IMediaLibraryAlbum[] | null>(null);

  const [assetsPage, setAssetsPage] =
    createSignal<IMediaLibraryPagedInfo<IMediaLibraryAsset> | null>(null);
  const [firstAsset, setFirstAsset] = createSignal<IMediaLibraryAsset | null>(null);

  const [assetInfo, setAssetInfo] = createSignal<IMediaLibraryAssetInfo | null>(null);
  const [assetInfoError, setAssetInfoError] = createSignal<string | null>(null);
  const [isFavorite, setIsFavorite] = createSignal(false);
  const [favoriteError, setFavoriteError] = createSignal<string | null>(null);

  const [momentsCount, setMomentsCount] = createSignal<number | null>(null);
  const [momentsError, setMomentsError] = createSignal<string | null>(null);
  const [contentUri, setContentUri] = createSignal<string | null>(null);
  const [contentUriError, setContentUriError] = createSignal<string | null>(null);

  const [isSubscribed, setIsSubscribed] = createSignal(false);
  const [eventCount, setEventCount] = createSignal(0);
  const [lastEvent, setLastEvent] = createSignal<IMediaLibraryAssetsChangeEvent | null>(null);

  const permissionStatusDisplay = () => {
    const response = permissionResponse();
    return response === null ? 'not checked yet' : formatPermissionResponse(response);
  };

  const albumCountDisplay = () => {
    const list = albums();
    return list === null ? 'not loaded yet' : `${list.length} albums`;
  };
  const albumListDisplay = () => {
    const list = albums();
    if (!list || list.length === 0) {
      return 'no albums';
    }
    return list.map(album => `${album.title} (${album.assetCount})`).join(', ');
  };

  const assetCountDisplay = () => {
    const page = assetsPage();
    if (!page) {
      return 'not loaded yet';
    }
    return `${page.assets.length} of ${page.totalCount}${page.hasNextPage ? ' (more available)' : ''}`;
  };
  const assetListDisplay = () => {
    const page = assetsPage();
    if (!page || page.assets.length === 0) {
      return 'no assets';
    }
    return page.assets.map(asset => `${asset.filename} (${asset.mediaType})`).join(', ');
  };

  const assetInfoDisplay = () => {
    if (assetInfoError()) {
      return assetInfoError()!;
    }
    const info = assetInfo();
    return info === null ? 'not loaded yet' : formatAssetInfo(info);
  };

  const momentsDisplay = () => {
    if (momentsError()) {
      return momentsError()!;
    }
    return momentsCount() === null ? 'not loaded yet' : `${momentsCount()} moments`;
  };
  const contentUriDisplay = () => {
    if (contentUriError()) {
      return contentUriError()!;
    }
    return contentUri() === null ? 'not loaded yet' : contentUri()!;
  };

  const eventCountDisplay = () => `${eventCount()} event(s) since subscribing`;
  const lastEventDisplay = () => {
    const event = lastEvent();
    return event === null ? 'none yet' : `hasIncrementalChanges: ${event.hasIncrementalChanges}`;
  };

  const handleRequestPermission = async () => {
    const result = await requestPermissionsAsync(false, ['photo', 'video', 'audio']);
    if (!disposed) {
      setPermissionResponse(result);
    }
  };
  const handleGetPermission = async () => {
    const result = await getPermissionsAsync(false, ['photo', 'video', 'audio']);
    if (!disposed) {
      setPermissionResponse(result);
    }
  };
  const handlePresentPicker = async () => {
    try {
      await presentPermissionsPickerAsync();
      setPickerError(null);
    } catch (error) {
      setPickerError(errorMessage(error));
    }
  };

  const handleLoadAlbums = async () => {
    const result = await getAlbumsAsync();
    if (!disposed) {
      setAlbums(result);
    }
  };

  const handleLoadAssets = async () => {
    const result = await getAssetsAsync({ first: 10 });
    if (!disposed) {
      setAssetsPage(result);
      setFirstAsset(result.assets[0] ?? null);
    }
  };

  const handleLoadAssetInfo = async () => {
    const asset = firstAsset();
    if (!asset) {
      setAssetInfoError('no asset loaded yet — use "Load assets" first');
      return;
    }
    try {
      const info = await getAssetInfoAsync(asset);
      setAssetInfoError(null);
      setAssetInfo(info);
      setIsFavorite(info.isFavorite ?? false);
    } catch (error) {
      setAssetInfo(null);
      setAssetInfoError(errorMessage(error));
    }
  };

  const handleToggleFavorite = async () => {
    const asset = firstAsset();
    if (!asset) {
      setFavoriteError('no asset loaded yet — use "Load assets" first');
      return;
    }
    try {
      const next = !isFavorite();
      await setAssetFavoriteAsync(asset, next);
      setFavoriteError(null);
      setIsFavorite(next);
    } catch (error) {
      setFavoriteError(errorMessage(error));
    }
  };

  const handleLoadMoments = async () => {
    try {
      const result = await getMomentsAsync();
      setMomentsError(null);
      setMomentsCount(result.length);
    } catch (error) {
      setMomentsCount(null);
      setMomentsError(errorMessage(error));
    }
  };

  const handleLoadContentUri = async () => {
    const asset = firstAsset();
    if (!asset) {
      setContentUriError('no asset loaded yet — use "Load assets" first');
      return;
    }
    try {
      const uri = await getAssetContentUriAsync(asset);
      setContentUriError(null);
      setContentUri(uri);
    } catch (error) {
      setContentUri(null);
      setContentUriError(errorMessage(error));
    }
  };

  const handleToggleSubscribe = () => {
    if (isSubscribed()) {
      mediaSubscription?.remove();
      mediaSubscription = null;
      setIsSubscribed(false);
      return;
    }
    mediaSubscription = addListener(event => {
      if (!disposed) {
        setEventCount(count => count + 1);
        setLastEvent(event);
      }
    });
    setIsSubscribed(true);
  };

  // --- modern: Query / Asset / Album shared-object surface ---
  const [modernPermissionStatus, setModernPermissionStatus] = createSignal<string | null>(null);
  const [queryResultText, setQueryResultText] = createSignal<string | null>(null);
  let firstModernAsset: IModernAsset | null = null;
  const [modernAssetDetail, setModernAssetDetail] = createSignal<string | null>(null);
  const [modernAlbumsText, setModernAlbumsText] = createSignal<string | null>(null);

  const handleRequestModernPermission = async () => {
    try {
      const response = await requestModernPermissionsAsync(false, ['photo', 'video', 'audio']);
      setModernPermissionStatus(response.status);
    } catch (error) {
      setModernPermissionStatus(`Failed: ${errorMessage(error)}`);
    }
  };

  const handleRunQuery = async () => {
    try {
      const results = await new Query()
        .orderBy(AssetField.CREATION_TIME)
        .limit(QUERY_RESULT_LIMIT)
        .exe();
      firstModernAsset = results[0] ?? null;
      const filenames = await Promise.all(results.map(asset => asset.getFilename()));
      setQueryResultText(`${results.length} result(s): ${filenames.join(', ') || 'none'}`);
    } catch (error) {
      setQueryResultText(`Failed: ${errorMessage(error)}`);
    }
  };

  const handleLoadModernAssetDetail = async () => {
    if (!firstModernAsset) {
      setModernAssetDetail('run query first');
      return;
    }
    try {
      const [width, height, mediaType, favorite] = await Promise.all([
        firstModernAsset.getWidth(),
        firstModernAsset.getHeight(),
        firstModernAsset.getMediaType(),
        firstModernAsset.getFavorite(),
      ]);
      setModernAssetDetail(`${width}x${height} · ${mediaType} · favorite: ${favorite}`);
    } catch (error) {
      setModernAssetDetail(`Failed: ${errorMessage(error)}`);
    }
  };

  const handleLoadModernAlbums = async () => {
    try {
      const albumsResult = await ModernAlbum.getAll();
      const titles = await Promise.all(albumsResult.map(album => album.getTitle()));
      setModernAlbumsText(`${albumsResult.length} album(s): ${titles.join(', ') || 'none'}`);
    } catch (error) {
      setModernAlbumsText(`Failed: ${errorMessage(error)}`);
    }
  };

  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="media-library-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="media-library-hero" class="hero-card">
          <view class="hero-badge" style={{ backgroundColor: lineColor }}>
            <text class="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Media Library</text>
            <text class="hero-body">
              @symbiote-native/media-library — read-only photo/video library: permissions,
              albums, assets, and change events. Reads whatever already exists in the
              simulator/device library; nothing here creates, saves, or deletes an asset.
            </text>
          </view>
        </view>

        <view testID="media-library-permissions-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Permissions</text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="media-library-permission-status" class="value-text">
              {permissionStatusDisplay()}
            </text>
          </view>
          <ActionButton
            testID="media-library-request-permission"
            title="Request permission"
            onPress={() => void handleRequestPermission()}
            color={lineColor}
          />
          <ActionButton
            testID="media-library-get-permission"
            title="Get permission"
            onPress={() => void handleGetPermission()}
            color={lineColor}
          />
          <ActionButton
            testID="media-library-present-picker"
            title="Present limited-access picker"
            onPress={() => void handlePresentPicker()}
            color={lineColor}
          />
          {pickerError() && (
            <view class="capability-row">
              <text class="capability-label">Error</text>
              <text class="value-text">{pickerError()}</text>
            </view>
          )}
        </view>

        <view testID="media-library-albums-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Albums</text>
          </view>
          <ActionButton
            testID="media-library-load-albums"
            title="Load albums"
            onPress={() => void handleLoadAlbums()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Count</text>
            <text testID="media-library-album-count" class="value-text">
              {albumCountDisplay()}
            </text>
          </view>
          <text testID="media-library-album-list" class="info-text">
            {albumListDisplay()}
          </text>
        </view>

        <view testID="media-library-assets-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Assets</text>
          </view>
          <ActionButton
            testID="media-library-load-assets"
            title="Load assets"
            onPress={() => void handleLoadAssets()}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Count</text>
            <text testID="media-library-asset-count" class="value-text">
              {assetCountDisplay()}
            </text>
          </view>
          <text testID="media-library-asset-list" class="info-text">
            {assetListDisplay()}
          </text>
        </view>

        <view testID="media-library-asset-detail-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Asset detail</text>
          </view>
          <text class="info-text">Operates on the first asset loaded above.</text>
          <ActionButton
            testID="media-library-load-asset-info"
            title="Load asset info"
            onPress={() => void handleLoadAssetInfo()}
            color={lineColor}
          />
          <text testID="media-library-asset-info" class="info-text">
            {assetInfoDisplay()}
          </text>
          <ActionButton
            testID="media-library-toggle-favorite"
            title={isFavorite() ? 'Unfavorite' : 'Favorite'}
            onPress={() => void handleToggleFavorite()}
            color={lineColor}
          />
          {favoriteError() && (
            <view class="capability-row">
              <text class="capability-label">Error</text>
              <text class="value-text">{favoriteError()}</text>
            </view>
          )}
        </view>

        {Platform.OS === 'ios' && (
          <view testID="media-library-moments-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Moments</text>
            </view>
            <ActionButton
              testID="media-library-load-moments"
              title="Load moments"
              onPress={() => void handleLoadMoments()}
              color={lineColor}
            />
            <view class="capability-row">
              <text class="capability-label">Count</text>
              <text testID="media-library-moments-count" class="value-text">
                {momentsDisplay()}
              </text>
            </view>
          </view>
        )}
        {Platform.OS === 'android' && (
          <view testID="media-library-content-uri-card" class="feature-card">
            <view class="feature-card-header">
              <text class="feature-card-title">Content URI</text>
            </view>
            <ActionButton
              testID="media-library-load-content-uri"
              title="Load content URI"
              onPress={() => void handleLoadContentUri()}
              color={lineColor}
            />
            <text testID="media-library-content-uri" class="info-text">
              {contentUriDisplay()}
            </text>
          </view>
        )}

        <view testID="media-library-listener-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Change listener</text>
          </view>
          <ActionButton
            testID="media-library-subscribe-toggle"
            title={isSubscribed() ? 'Unsubscribe' : 'Subscribe'}
            onPress={handleToggleSubscribe}
            color={lineColor}
          />
          <view class="capability-row">
            <text class="capability-label">Events</text>
            <text testID="media-library-event-count" class="value-text">
              {eventCountDisplay()}
            </text>
          </view>
          <view class="capability-row">
            <text class="capability-label">Last event</text>
            <text testID="media-library-last-event" class="value-text">
              {lastEventDisplay()}
            </text>
          </view>
        </view>

        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">
            Modern API — Query / Asset / Album (SDK-57 default surface)
          </text>
        </view>

        <view testID="media-library-modern-permission-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Modern permission</text>
          </view>
          <ActionButton
            testID="media-library-modern-request-permission"
            title="Request permission"
            onPress={() => void handleRequestModernPermission()}
            color={lineColor}
          />
          <text testID="media-library-modern-permission-result" class="value-text">
            {modernPermissionStatus() ?? 'not requested yet'}
          </text>
        </view>

        <view testID="media-library-query-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Query</text>
          </view>
          <text class="info-text">
            {`new Query().orderBy(AssetField.CREATION_TIME).limit(${QUERY_RESULT_LIMIT}).exe()`}
          </text>
          <ActionButton
            testID="media-library-run-query"
            title="Run query"
            onPress={() => void handleRunQuery()}
            color={lineColor}
          />
          <text testID="media-library-query-result" class="value-text">
            {queryResultText() ?? 'not run yet'}
          </text>
        </view>

        <view testID="media-library-modern-asset-detail-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Asset detail (modern)</text>
          </view>
          <ActionButton
            testID="media-library-load-modern-asset-detail"
            title="Load first query result's detail"
            onPress={() => void handleLoadModernAssetDetail()}
            color={lineColor}
          />
          <text testID="media-library-modern-asset-detail-result" class="value-text">
            {modernAssetDetail() ?? 'not loaded yet'}
          </text>
        </view>

        <view testID="media-library-modern-albums-card" class="feature-card">
          <view class="feature-card-header">
            <text class="feature-card-title">Albums (modern)</text>
          </view>
          <ActionButton
            testID="media-library-load-modern-albums"
            title="Album.getAll()"
            onPress={() => void handleLoadModernAlbums()}
            color={lineColor}
          />
          <text testID="media-library-modern-albums-result" class="value-text">
            {modernAlbumsText() ?? 'not loaded yet'}
          </text>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
