<!--
  @symbiote-native/media-library tour stop — permissions (incl. the limited-access picker),
  albums, a paged asset list, per-asset detail (info + favorite toggle), a platform-only extra
  (iOS moments / Android content URI), and a library-change listener. Deliberately READ-ONLY: no
  camera/image-picker dependency in this app, so the demo only reads whatever photos/videos
  already exist in the simulator/device library — it never creates, saves, or deletes an asset.
  First port of this screen across the example suite — no React/Svelte/Solid/Angular twin to
  mirror yet.
-->
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
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
import ActionButton from '../components/ActionButton.vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const REQUESTED_PERMISSIONS = ['photo', 'video', 'audio'] as const;
const QUERY_RESULT_LIMIT = 5;

function formatPermissionStatus(response: IMediaLibraryPermissionResponse): string {
  return response.accessPrivileges
    ? `${response.status} · ${response.accessPrivileges}`
    : response.status;
}

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.MediaLibrary];
const lineColor = LINE_COLOR[lineInfo.line];

// Permissions
const permissionStatusText = ref('not checked yet');
const pickerError = ref<string | null>(null);

function handleRequestPermission(): void {
  void requestPermissionsAsync(false, [...REQUESTED_PERMISSIONS])
    .then(response => {
      permissionStatusText.value = formatPermissionStatus(response);
    })
    .catch((error: Error) => {
      permissionStatusText.value = `request failed: ${error.message}`;
    });
}

function handleGetPermission(): void {
  void getPermissionsAsync(false, [...REQUESTED_PERMISSIONS])
    .then(response => {
      permissionStatusText.value = formatPermissionStatus(response);
    })
    .catch((error: Error) => {
      permissionStatusText.value = `get failed: ${error.message}`;
    });
}

function handlePresentPicker(): void {
  pickerError.value = null;
  void presentPermissionsPickerAsync(['photo', 'video']).catch((error: Error) => {
    pickerError.value = `picker failed: ${error.message}`;
  });
}

// Albums
const albums = ref<IMediaLibraryAlbum[]>([]);
const albumsError = ref<string | null>(null);

const albumCountText = computed(
  () => `${albums.value.length} album${albums.value.length === 1 ? '' : 's'}`,
);
const albumListText = computed(() =>
  albums.value.length === 0
    ? 'No albums loaded yet.'
    : albums.value.map(album => `${album.title} (${album.assetCount})`).join(', '),
);

function handleLoadAlbums(): void {
  albumsError.value = null;
  void getAlbumsAsync()
    .then(result => {
      albums.value = result;
    })
    .catch((error: Error) => {
      albumsError.value = `load albums failed: ${error.message}`;
    });
}

// Assets
const assets = ref<IMediaLibraryAsset[]>([]);
const totalCount = ref(0);
const hasNextPage = ref(false);
const assetsError = ref<string | null>(null);

const firstAsset = computed<IMediaLibraryAsset | null>(() => assets.value[0] ?? null);

const assetCountText = computed(() =>
  assets.value.length === 0
    ? 'No assets loaded yet.'
    : `${assets.value.length} of ${totalCount.value}${hasNextPage.value ? ' (more available)' : ''}`,
);
const assetListText = computed(() =>
  assets.value.length === 0
    ? 'No assets loaded yet.'
    : assets.value.map(asset => `${asset.filename} (${asset.mediaType})`).join(', '),
);

function handleLoadAssets(): void {
  assetsError.value = null;
  void getAssetsAsync({ first: 10 })
    .then(page => {
      assets.value = page.assets;
      totalCount.value = page.totalCount;
      hasNextPage.value = page.hasNextPage;
    })
    .catch((error: Error) => {
      assetsError.value = `load assets failed: ${error.message}`;
    });
}

// Asset detail — operates on the first asset loaded above.
const assetInfo = ref<IMediaLibraryAssetInfo | null>(null);
const assetInfoMessage = ref<string | null>(null);
const favoriteState = ref(false);
const favoriteError = ref<string | null>(null);

const assetInfoText = computed(() => {
  const info = assetInfo.value;
  if (!info) return 'No asset info loaded yet.';
  const parts = [
    info.localUri ? `localUri: ${info.localUri}` : null,
    info.location
      ? `location: ${info.location.latitude.toFixed(4)}, ${info.location.longitude.toFixed(4)}`
      : null,
    info.isFavorite !== undefined ? `isFavorite: ${info.isFavorite}` : null,
    info.orientation !== undefined ? `orientation: ${info.orientation}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? 'No extra info on this asset.' : parts.join(' · ');
});

function handleLoadAssetInfo(): void {
  assetInfoMessage.value = null;
  const asset = firstAsset.value;
  if (!asset) {
    assetInfoMessage.value = 'Load assets first.';
    return;
  }
  void getAssetInfoAsync(asset)
    .then(info => {
      assetInfo.value = info;
    })
    .catch((error: Error) => {
      assetInfoMessage.value = `get info failed: ${error.message}`;
    });
}

function handleToggleFavorite(): void {
  favoriteError.value = null;
  const asset = firstAsset.value;
  if (!asset) {
    favoriteError.value = 'Load assets first.';
    return;
  }
  // iOS-only upstream — legitimately rejects on Android, shown inline rather than crashing.
  void setAssetFavoriteAsync(asset, !favoriteState.value)
    .then(() => {
      favoriteState.value = !favoriteState.value;
    })
    .catch((error: Error) => {
      favoriteError.value = `toggle favorite failed: ${error.message}`;
    });
}

// Platform extra — iOS moments / Android content URI.
const moments = ref<IMediaLibraryAlbum[]>([]);
const momentsError = ref<string | null>(null);
const momentsCountText = computed(
  () => `${moments.value.length} moment${moments.value.length === 1 ? '' : 's'}`,
);

function handleLoadMoments(): void {
  momentsError.value = null;
  void getMomentsAsync()
    .then(result => {
      moments.value = result;
    })
    .catch((error: Error) => {
      momentsError.value = `get moments failed: ${error.message}`;
    });
}

const contentUri = ref<string | null>(null);
const contentUriMessage = ref<string | null>(null);
const contentUriText = computed(() => contentUri.value ?? 'Not loaded yet.');

function handleLoadContentUri(): void {
  contentUriMessage.value = null;
  const asset = firstAsset.value;
  if (!asset) {
    contentUriMessage.value = 'Load assets first.';
    return;
  }
  void getAssetContentUriAsync(asset)
    .then(uri => {
      contentUri.value = uri;
    })
    .catch((error: Error) => {
      contentUriMessage.value = `get content uri failed: ${error.message}`;
    });
}

// Change listener
let subscription: ReturnType<typeof addListener> | null = null;
const isSubscribed = ref(false);
const eventCount = ref(0);
const lastEvent = ref<IMediaLibraryAssetsChangeEvent | null>(null);

const subscribeButtonTitle = computed(() => (isSubscribed.value ? 'Unsubscribe' : 'Subscribe'));
const lastEventText = computed(() =>
  lastEvent.value === null ? 'none yet' : String(lastEvent.value.hasIncrementalChanges),
);

function handleToggleSubscribe(): void {
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

onUnmounted(() => {
  subscription?.remove();
  subscription = null;
});

// Modern API — Query / Asset / Album shared-object surface
const modernPermissionText = ref<string | null>(null);
const modernPermissionError = ref<string | null>(null);

function handleRequestModernPermission(): void {
  modernPermissionError.value = null;
  void requestModernPermissionsAsync(false, [...REQUESTED_PERMISSIONS])
    .then(response => {
      modernPermissionText.value = response.status;
    })
    .catch((error: Error) => {
      modernPermissionError.value = `request failed: ${error.message}`;
    });
}

const queryResultText = ref<string | null>(null);
const queryError = ref<string | null>(null);
let firstModernAsset: IModernAsset | null = null;

function handleRunQuery(): void {
  queryError.value = null;
  void new Query()
    .orderBy(AssetField.CREATION_TIME)
    .limit(QUERY_RESULT_LIMIT)
    .exe()
    .then(results => {
      firstModernAsset = results[0] ?? null;
      return Promise.all(results.map(asset => asset.getFilename())).then(filenames => {
        queryResultText.value = `${results.length} result(s): ${filenames.join(', ') || 'none'}`;
      });
    })
    .catch((error: Error) => {
      queryError.value = `query failed: ${error.message}`;
    });
}

const modernAssetDetailText = ref<string | null>(null);
const modernAssetDetailError = ref<string | null>(null);

function handleLoadModernAssetDetail(): void {
  modernAssetDetailError.value = null;
  if (!firstModernAsset) {
    modernAssetDetailError.value = 'Run query first.';
    return;
  }
  void Promise.all([
    firstModernAsset.getWidth(),
    firstModernAsset.getHeight(),
    firstModernAsset.getMediaType(),
    firstModernAsset.getFavorite(),
  ])
    .then(([width, height, mediaType, favorite]) => {
      modernAssetDetailText.value = `${width}x${height} · ${mediaType} · favorite: ${favorite}`;
    })
    .catch((error: Error) => {
      modernAssetDetailError.value = `load failed: ${error.message}`;
    });
}

const modernAlbumsText = ref<string | null>(null);
const modernAlbumsError = ref<string | null>(null);

function handleLoadModernAlbums(): void {
  modernAlbumsError.value = null;
  void ModernAlbum.getAll()
    .then(albumsResult =>
      Promise.all(albumsResult.map(album => album.getTitle())).then(titles => {
        modernAlbumsText.value = `${albumsResult.length} album(s): ${titles.join(', ') || 'none'}`;
      }),
    )
    .catch((error: Error) => {
      modernAlbumsError.value = `load failed: ${error.message}`;
    });
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="media-library-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</text>
      </view>
      <view class="hero-card">
        <view class="hero-badge" :style="{ backgroundColor: lineColor }">
          <text class="hero-badge-text">{{ lineInfo.code }}</text>
        </view>
        <view class="hero-copy">
          <text class="hero-title">Media Library</text>
          <text testID="media-library-hero" class="hero-body"
            >@symbiote-native/media-library — read-only tour of the device's
            photo/video library: permissions, albums, assets, and change
            events. Nothing here creates, saves, or deletes anything.</text
          >
        </view>
      </view>

      <view testID="media-library-permissions-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Permissions</text>
        </view>
        <text testID="media-library-permission-status" class="auth-value-text">{{
          permissionStatusText
        }}</text>
        <view class="button-row">
          <ActionButton
            testID="media-library-request-permission"
            title="Request"
            :onPress="handleRequestPermission"
            :color="lineColor"
          />
          <ActionButton
            testID="media-library-get-permission"
            title="Get"
            :onPress="handleGetPermission"
            :color="lineColor"
          />
        </view>
        <ActionButton
          testID="media-library-present-picker"
          title="Present permissions picker"
          :onPress="handlePresentPicker"
          :color="lineColor"
        />
        <view v-if="pickerError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ pickerError }}</text>
        </view>
      </view>

      <view testID="media-library-albums-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Albums</text>
        </view>
        <ActionButton
          testID="media-library-load-albums"
          title="Load albums"
          :onPress="handleLoadAlbums"
          :color="lineColor"
        />
        <text testID="media-library-album-count" class="auth-value-text">{{
          albumCountText
        }}</text>
        <text testID="media-library-album-list" class="info-text">{{
          albumListText
        }}</text>
        <view v-if="albumsError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ albumsError }}</text>
        </view>
      </view>

      <view testID="media-library-assets-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Assets</text>
        </view>
        <ActionButton
          testID="media-library-load-assets"
          title="Load first 10 assets"
          :onPress="handleLoadAssets"
          :color="lineColor"
        />
        <text testID="media-library-asset-count" class="auth-value-text">{{
          assetCountText
        }}</text>
        <text testID="media-library-asset-list" class="info-text">{{
          assetListText
        }}</text>
        <view v-if="assetsError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ assetsError }}</text>
        </view>
      </view>

      <view testID="media-library-asset-detail-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Asset detail</text>
        </view>
        <text class="info-text">Operates on the first asset loaded above.</text>
        <ActionButton
          testID="media-library-load-asset-info"
          title="Load asset info"
          :onPress="handleLoadAssetInfo"
          :color="lineColor"
        />
        <text testID="media-library-asset-info" class="auth-value-text">{{
          assetInfoText
        }}</text>
        <view v-if="assetInfoMessage" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ assetInfoMessage }}</text>
        </view>
        <ActionButton
          testID="media-library-toggle-favorite"
          title="Toggle favorite (iOS only)"
          :onPress="handleToggleFavorite"
          :color="lineColor"
        />
        <view v-if="favoriteError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ favoriteError }}</text>
        </view>
      </view>

      <view testID="media-library-platform-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Platform extra</text>
        </view>
        <view v-if="Platform.OS === 'ios'">
          <ActionButton
            testID="media-library-load-moments"
            title="Load moments"
            :onPress="handleLoadMoments"
            :color="lineColor"
          />
          <text testID="media-library-moments-count" class="auth-value-text">{{
            momentsCountText
          }}</text>
          <view v-if="momentsError" class="auth-result auth-result-error">
            <text class="auth-result-text">{{ momentsError }}</text>
          </view>
        </view>
        <view v-else>
          <ActionButton
            testID="media-library-load-content-uri"
            title="Load content URI"
            :onPress="handleLoadContentUri"
            :color="lineColor"
          />
          <text testID="media-library-content-uri" class="auth-value-text">{{
            contentUriText
          }}</text>
          <view v-if="contentUriMessage" class="auth-result auth-result-error">
            <text class="auth-result-text">{{ contentUriMessage }}</text>
          </view>
        </view>
      </view>

      <view testID="media-library-subscription-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Change listener</text>
        </view>
        <ActionButton
          testID="media-library-subscribe-toggle"
          :title="subscribeButtonTitle"
          :onPress="handleToggleSubscribe"
          :color="lineColor"
        />
        <text testID="media-library-event-count" class="auth-value-text"
          >{{ eventCount }} event{{ eventCount === 1 ? '' : 's' }}</text
        >
        <text testID="media-library-last-event" class="info-text">{{
          lastEventText
        }}</text>
      </view>

      <view :class="`line-tag line-tag-${lineInfo.line}`">
        <text class="line-tag-text"
          >Modern API — Query / Asset / Album (SDK-57 default surface)</text
        >
      </view>

      <view testID="media-library-modern-permission-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Modern permission</text>
        </view>
        <ActionButton
          testID="media-library-modern-request-permission"
          title="Request permission"
          :onPress="handleRequestModernPermission"
          :color="lineColor"
        />
        <text testID="media-library-modern-permission-result" class="info-text">{{
          modernPermissionText ?? 'not requested yet'
        }}</text>
        <view v-if="modernPermissionError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ modernPermissionError }}</text>
        </view>
      </view>

      <view testID="media-library-query-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Query</text>
        </view>
        <text class="info-text"
          >{{
            `new Query().orderBy(AssetField.CREATION_TIME).limit(${QUERY_RESULT_LIMIT}).exe()`
          }}</text
        >
        <ActionButton
          testID="media-library-run-query"
          title="Run query"
          :onPress="handleRunQuery"
          :color="lineColor"
        />
        <text testID="media-library-query-result" class="info-text">{{
          queryResultText ?? 'not run yet'
        }}</text>
        <view v-if="queryError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ queryError }}</text>
        </view>
      </view>

      <view testID="media-library-modern-asset-detail-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Asset detail (modern)</text>
        </view>
        <ActionButton
          testID="media-library-load-modern-asset-detail"
          title="Load first query result's detail"
          :onPress="handleLoadModernAssetDetail"
          :color="lineColor"
        />
        <text testID="media-library-modern-asset-detail-result" class="info-text">{{
          modernAssetDetailText ?? 'not loaded yet'
        }}</text>
        <view v-if="modernAssetDetailError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ modernAssetDetailError }}</text>
        </view>
      </view>

      <view testID="media-library-modern-albums-card" class="auth-card">
        <view class="auth-card-header">
          <text class="auth-card-title">Albums (modern)</text>
        </view>
        <ActionButton
          testID="media-library-load-modern-albums"
          title="Album.getAll()"
          :onPress="handleLoadModernAlbums"
          :color="lineColor"
        />
        <text testID="media-library-modern-albums-result" class="info-text">{{
          modernAlbumsText ?? 'not loaded yet'
        }}</text>
        <view v-if="modernAlbumsError" class="auth-result auth-result-error">
          <text class="auth-result-text">{{ modernAlbumsError }}</text>
        </view>
      </view>
    </scroll-view>
  </safe-area-view>
</template>
