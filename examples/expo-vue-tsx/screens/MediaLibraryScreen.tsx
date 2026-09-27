import { computed, defineComponent, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { Platform } from '@symbiote-native/vue';
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
  IMediaLibraryPermissionResponse,
} from '@symbiote-native/media-library/legacy';
import {
  AssetField,
  Query,
  Album as ModernAlbum,
  requestPermissionsAsync as requestModernPermissionsAsync,
} from '@symbiote-native/media-library/vue';
import type { Asset as IModernAsset } from '@symbiote-native/media-library/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const GRANULAR_PERMISSIONS = ['photo', 'video', 'audio'] as const;
const QUERY_RESULT_LIMIT = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describePermission(response: IMediaLibraryPermissionResponse): string {
  const privileges = response.accessPrivileges ? ` · ${response.accessPrivileges}` : '';
  return `${response.status}${privileges} · granted: ${response.granted}`;
}

function describeAsset(asset: IMediaLibraryAsset): string {
  return `${asset.filename} (${asset.mediaType})`;
}

function describeAlbum(album: IMediaLibraryAlbum): string {
  return `${album.title} (${album.assetCount})`;
}

function describeAssetInfo(info: IMediaLibraryAssetInfo): string {
  const parts: string[] = [];
  if (info.localUri) parts.push(`localUri: ${info.localUri}`);
  if (info.location) {
    parts.push(
      `location: ${info.location.latitude.toFixed(4)}, ${info.location.longitude.toFixed(4)}`,
    );
  }
  if (info.isFavorite !== undefined) parts.push(`isFavorite: ${info.isFavorite}`);
  if (info.orientation !== undefined) parts.push(`orientation: ${info.orientation}`);
  return parts.length > 0 ? parts.join('\n') : 'no extra fields for this asset';
}

/**
 * Media library demo: @symbiote-native/media-library — permissions, albums, assets, asset
 * detail, and change events. Deliberately read-only: nothing is created, saved, or deleted, it
 * only reads whatever the simulator/device's library already has.
 */
export const MediaLibraryScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.MediaLibrary];
    const lineColor = LINE_COLOR[lineInfo.line];

    const permissionStatus = ref('not checked yet');
    const presentPickerError: Ref<string | null> = ref(null);

    const albums: Ref<IMediaLibraryAlbum[]> = ref([]);
    const albumsError: Ref<string | null> = ref(null);

    const assets: Ref<IMediaLibraryAsset[]> = ref([]);
    const totalCount = ref(0);
    const hasNextPage = ref(false);
    const assetsError: Ref<string | null> = ref(null);
    const firstAsset = computed<IMediaLibraryAsset | null>(() => assets.value[0] ?? null);

    const assetInfoText = ref('no asset loaded yet');
    const isFavorite = ref(false);
    const favoriteText: Ref<string | null> = ref(null);

    const momentsCount = ref('not loaded yet');
    const contentUriText = ref('not loaded yet');

    const isSubscribed = ref(false);
    const eventCount = ref(0);
    const lastEvent: Ref<IMediaLibraryAssetsChangeEvent | null> = ref(null);
    let subscription: ReturnType<typeof addListener> | null = null;

    onUnmounted(() => {
      subscription?.remove();
    });

    async function handleRequestPermission() {
      try {
        const response = await requestPermissionsAsync(false, [...GRANULAR_PERMISSIONS]);
        permissionStatus.value = describePermission(response);
      } catch (error) {
        permissionStatus.value = `Failed: ${errorMessage(error)}`;
      }
    }

    async function handleGetPermission() {
      try {
        const response = await getPermissionsAsync(false, [...GRANULAR_PERMISSIONS]);
        permissionStatus.value = describePermission(response);
      } catch (error) {
        permissionStatus.value = `Failed: ${errorMessage(error)}`;
      }
    }

    async function handlePresentPicker() {
      try {
        await presentPermissionsPickerAsync();
        presentPickerError.value = null;
      } catch (error) {
        presentPickerError.value = errorMessage(error);
      }
    }

    async function handleLoadAlbums() {
      try {
        albums.value = await getAlbumsAsync();
        albumsError.value = null;
      } catch (error) {
        albumsError.value = errorMessage(error);
      }
    }

    async function handleLoadAssets() {
      try {
        const page = await getAssetsAsync({ first: 10 });
        assets.value = page.assets;
        totalCount.value = page.totalCount;
        hasNextPage.value = page.hasNextPage;
        assetsError.value = null;
      } catch (error) {
        assetsError.value = errorMessage(error);
      }
    }

    async function handleLoadAssetInfo() {
      const asset = firstAsset.value;
      if (!asset) {
        assetInfoText.value = 'load assets first';
        return;
      }
      try {
        const info = await getAssetInfoAsync(asset);
        isFavorite.value = !!info.isFavorite;
        assetInfoText.value = describeAssetInfo(info);
      } catch (error) {
        assetInfoText.value = `Failed: ${errorMessage(error)}`;
      }
    }

    async function handleToggleFavorite() {
      const asset = firstAsset.value;
      if (!asset) {
        favoriteText.value = 'load assets first';
        return;
      }
      try {
        await setAssetFavoriteAsync(asset, !isFavorite.value);
        isFavorite.value = !isFavorite.value;
        favoriteText.value = `favorite: ${isFavorite.value}`;
      } catch (error) {
        favoriteText.value = `Failed: ${errorMessage(error)}`;
      }
    }

    async function handleLoadMoments() {
      try {
        const moments = await getMomentsAsync();
        momentsCount.value = `${moments.length} moments`;
      } catch (error) {
        momentsCount.value = `Failed: ${errorMessage(error)}`;
      }
    }

    async function handleLoadContentUri() {
      const asset = firstAsset.value;
      if (!asset) {
        contentUriText.value = 'load assets first';
        return;
      }
      try {
        contentUriText.value = await getAssetContentUriAsync(asset);
      } catch (error) {
        contentUriText.value = `Failed: ${errorMessage(error)}`;
      }
    }

    function handleToggleSubscribe() {
      if (isSubscribed.value) {
        subscription?.remove();
        subscription = null;
        isSubscribed.value = false;
        return;
      }
      subscription = addListener(event => {
        eventCount.value += 1;
        lastEvent.value = event;
      });
      isSubscribed.value = true;
    }

    const albumCountLabel = computed(
      () => `${albums.value.length} album${albums.value.length === 1 ? '' : 's'}`,
    );
    const albumListLabel = computed(() =>
      albums.value.length === 0
        ? 'no albums loaded yet'
        : albums.value.map(describeAlbum).join(', '),
    );
    const assetCountLabel = computed(() =>
      assets.value.length === 0
        ? 'not loaded yet'
        : `${assets.value.length} of ${totalCount.value}${hasNextPage.value ? ' (more available)' : ''}`,
    );
    const assetListLabel = computed(() =>
      assets.value.length === 0
        ? 'no assets loaded yet'
        : assets.value.map(describeAsset).join(', '),
    );
    const subscribeLabel = computed(() => (isSubscribed.value ? 'Unsubscribe' : 'Subscribe'));
    const lastEventText = computed(() =>
      lastEvent.value === null ? 'none yet' : String(lastEvent.value.hasIncrementalChanges),
    );

    // --- modern: Query / Asset / Album shared-object surface ---
    const modernPermissionText: Ref<string | null> = ref(null);
    const queryResultText: Ref<string | null> = ref(null);
    let firstModernAsset: IModernAsset | null = null;
    const modernAssetDetailText: Ref<string | null> = ref(null);
    const modernAlbumsText: Ref<string | null> = ref(null);

    async function handleRequestModernPermission() {
      try {
        const response = await requestModernPermissionsAsync(false, [...GRANULAR_PERMISSIONS]);
        modernPermissionText.value = response.status;
      } catch (error) {
        modernPermissionText.value = `Failed: ${errorMessage(error)}`;
      }
    }

    async function handleRunQuery() {
      try {
        const results = await new Query()
          .orderBy(AssetField.CREATION_TIME)
          .limit(QUERY_RESULT_LIMIT)
          .exe();
        firstModernAsset = results[0] ?? null;
        const filenames = await Promise.all(results.map(asset => asset.getFilename()));
        queryResultText.value = `${results.length} result(s): ${filenames.join(', ') || 'none'}`;
      } catch (error) {
        queryResultText.value = `Failed: ${errorMessage(error)}`;
      }
    }

    async function handleLoadModernAssetDetail() {
      if (!firstModernAsset) {
        modernAssetDetailText.value = 'run query first';
        return;
      }
      try {
        const [width, height, mediaType, favorite] = await Promise.all([
          firstModernAsset.getWidth(),
          firstModernAsset.getHeight(),
          firstModernAsset.getMediaType(),
          firstModernAsset.getFavorite(),
        ]);
        modernAssetDetailText.value = `${width}x${height} · ${mediaType} · favorite: ${favorite}`;
      } catch (error) {
        modernAssetDetailText.value = `Failed: ${errorMessage(error)}`;
      }
    }

    async function handleLoadModernAlbums() {
      try {
        const albumsResult = await ModernAlbum.getAll();
        const titles = await Promise.all(albumsResult.map(album => album.getTitle()));
        modernAlbumsText.value = `${albumsResult.length} album(s): ${titles.join(', ') || 'none'}`;
      } catch (error) {
        modernAlbumsText.value = `Failed: ${errorMessage(error)}`;
      }
    }

    return () => (
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
                @symbiote-native/media-library — reads the device's photo/video
                library: permissions, albums, assets, and change events.
                Read-only demo, nothing is created, saved, or deleted.
              </text>
            </view>
          </view>

          <view testID="media-library-permissions-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Permissions</text>
            </view>
            <view class="auth-capability-row">
              <text class="auth-capability-label">Status</text>
              <text
                testID="media-library-permission-status"
                class="auth-value-text"
              >
                {permissionStatus.value}
              </text>
            </view>
            <ActionButton
              testID="media-library-request-permission"
              title="Request permission"
              onPress={handleRequestPermission}
              color={lineColor}
            />
            <ActionButton
              testID="media-library-get-permission"
              title="Get permission"
              onPress={handleGetPermission}
              color={lineColor}
            />
            <ActionButton
              testID="media-library-present-picker"
              title="Present permissions picker"
              onPress={handlePresentPicker}
              color={lineColor}
            />
            {presentPickerError.value && (
              <view class="auth-result auth-result-error">
                <text class="auth-result-text">{`Failed: ${presentPickerError.value}`}</text>
              </view>
            )}
          </view>

          <view testID="media-library-albums-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Albums</text>
            </view>
            <ActionButton
              testID="media-library-load-albums"
              title="Load albums"
              onPress={handleLoadAlbums}
              color={lineColor}
            />
            <text testID="media-library-album-count" class="auth-value-text">
              {albumCountLabel.value}
            </text>
            <text testID="media-library-album-list" class="info-text">
              {albumListLabel.value}
            </text>
            {albumsError.value && (
              <view class="auth-result auth-result-error">
                <text class="auth-result-text">{`Failed: ${albumsError.value}`}</text>
              </view>
            )}
          </view>

          <view testID="media-library-assets-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Assets</text>
            </view>
            <ActionButton
              testID="media-library-load-assets"
              title="Load assets"
              onPress={handleLoadAssets}
              color={lineColor}
            />
            <text testID="media-library-asset-count" class="auth-value-text">
              {assetCountLabel.value}
            </text>
            <text testID="media-library-asset-list" class="info-text">
              {assetListLabel.value}
            </text>
            {assetsError.value && (
              <view class="auth-result auth-result-error">
                <text class="auth-result-text">{`Failed: ${assetsError.value}`}</text>
              </view>
            )}
          </view>

          <view testID="media-library-asset-detail-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Asset detail (first loaded asset)</text>
            </view>
            <ActionButton
              testID="media-library-load-asset-info"
              title="Load asset info"
              onPress={handleLoadAssetInfo}
              color={lineColor}
            />
            <text testID="media-library-asset-info" class="info-text">
              {assetInfoText.value}
            </text>
            <ActionButton
              testID="media-library-toggle-favorite"
              title={isFavorite.value ? 'Unfavorite' : 'Favorite'}
              onPress={handleToggleFavorite}
              color={lineColor}
            />
            {favoriteText.value && (
              <text class="info-text">{favoriteText.value}</text>
            )}
          </view>

          {Platform.OS === 'ios' && (
            <view testID="media-library-moments-card" class="auth-card">
              <view class="auth-card-header">
                <text class="auth-card-title">Moments</text>
              </view>
              <ActionButton
                testID="media-library-load-moments"
                title="Load moments"
                onPress={handleLoadMoments}
                color={lineColor}
              />
              <text testID="media-library-moments-count" class="auth-value-text">
                {momentsCount.value}
              </text>
            </view>
          )}
          {Platform.OS === 'android' && (
            <view testID="media-library-content-uri-card" class="auth-card">
              <view class="auth-card-header">
                <text class="auth-card-title">Content URI</text>
              </view>
              <ActionButton
                testID="media-library-load-content-uri"
                title="Get content URI (first loaded asset)"
                onPress={handleLoadContentUri}
                color={lineColor}
              />
              <text testID="media-library-content-uri" class="info-text">
                {contentUriText.value}
              </text>
            </view>
          )}

          <view testID="media-library-listener-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Change listener</text>
            </view>
            <ActionButton
              testID="media-library-subscribe-toggle"
              title={subscribeLabel.value}
              onPress={handleToggleSubscribe}
              color={lineColor}
            />
            <text testID="media-library-event-count" class="auth-value-text">
              {`${eventCount.value} event${eventCount.value === 1 ? '' : 's'}`}
            </text>
            <text testID="media-library-last-event" class="info-text">
              {lastEventText.value}
            </text>
          </view>

          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">
              Modern API — Query / Asset / Album (SDK-57 default surface)
            </text>
          </view>

          <view testID="media-library-modern-permission-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Modern permission</text>
            </view>
            <ActionButton
              testID="media-library-modern-request-permission"
              title="Request permission"
              onPress={handleRequestModernPermission}
              color={lineColor}
            />
            {modernPermissionText.value && (
              <text class="info-text">{modernPermissionText.value}</text>
            )}
          </view>

          <view testID="media-library-query-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Query</text>
            </view>
            <text class="info-text">
              {`new Query().orderBy(AssetField.CREATION_TIME).limit(${QUERY_RESULT_LIMIT}).exe()`}
            </text>
            <ActionButton
              testID="media-library-run-query"
              title="Run query"
              onPress={handleRunQuery}
              color={lineColor}
            />
            {queryResultText.value && (
              <text testID="media-library-query-result" class="info-text">
                {queryResultText.value}
              </text>
            )}
          </view>

          <view testID="media-library-modern-asset-detail-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Asset detail (modern)</text>
            </view>
            <ActionButton
              testID="media-library-load-modern-asset-detail"
              title="Load first query result's detail"
              onPress={handleLoadModernAssetDetail}
              color={lineColor}
            />
            {modernAssetDetailText.value && (
              <text testID="media-library-modern-asset-detail-result" class="info-text">
                {modernAssetDetailText.value}
              </text>
            )}
          </view>

          <view testID="media-library-modern-albums-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Albums (modern)</text>
            </view>
            <ActionButton
              testID="media-library-load-modern-albums"
              title="Album.getAll()"
              onPress={handleLoadModernAlbums}
              color={lineColor}
            />
            {modernAlbumsText.value && (
              <text testID="media-library-modern-albums-result" class="info-text">
                {modernAlbumsText.value}
              </text>
            )}
          </view>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'MediaLibraryScreen' },
);
