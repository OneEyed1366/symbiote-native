<script lang="ts">
  // @symbiote-native/media-library tour stop — READ-ONLY / LISTENER-ONLY: permissions, albums,
  // a 10-asset page, one asset's detail + favorite toggle, an iOS moments / Android content-URI
  // extra, and the library change listener. Deliberately never creates/saves/deletes an asset —
  // this app has no camera/image-picker dependency, so every read comes from whatever the
  // simulator/device's library already holds. Svelte twin of
  // ../../expo-vue-sfc/screens/MediaLibraryScreen.vue.
  import { Platform } from '@symbiote-native/svelte';
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
  } from '@symbiote-native/media-library';
  import type { Asset as IModernAsset } from '@symbiote-native/media-library';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const GRANULAR_PERMISSIONS = ['photo', 'video', 'audio'] as const;
  const QUERY_RESULT_LIMIT = 5;

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.MediaLibrary];
  const lineColor = LINE_COLOR[lineInfo.line];

  // Permissions
  let permissionResponse = $state<IMediaLibraryPermissionResponse | null>(null);
  let permissionError = $state<string | null>(null);

  const permissionStatusText = $derived(
    permissionResponse
      ? `${permissionResponse.status}${
          permissionResponse.accessPrivileges
            ? ` (${permissionResponse.accessPrivileges})`
            : ''
        }`
      : 'not checked yet',
  );

  async function handleRequestPermission(): Promise<void> {
    permissionError = null;
    try {
      permissionResponse = await requestPermissionsAsync(false, [
        ...GRANULAR_PERMISSIONS,
      ]);
    } catch (reason) {
      permissionError = String(reason);
    }
  }

  async function handleGetPermission(): Promise<void> {
    permissionError = null;
    try {
      permissionResponse = await getPermissionsAsync(false, [
        ...GRANULAR_PERMISSIONS,
      ]);
    } catch (reason) {
      permissionError = String(reason);
    }
  }

  let presentPickerError = $state<string | null>(null);

  async function handlePresentPicker(): Promise<void> {
    presentPickerError = null;
    try {
      await presentPermissionsPickerAsync();
    } catch (reason) {
      presentPickerError = String(reason);
    }
  }

  // Albums
  let albums = $state<IMediaLibraryAlbum[]>([]);
  let albumsError = $state<string | null>(null);

  async function handleLoadAlbums(): Promise<void> {
    albumsError = null;
    try {
      albums = await getAlbumsAsync();
    } catch (reason) {
      albumsError = String(reason);
    }
  }

  const albumListText = $derived(
    albums.map(album => `${album.title} (${album.assetCount})`).join(', '),
  );

  // Assets
  let assets = $state<IMediaLibraryAsset[]>([]);
  let totalCount = $state(0);
  let hasNextPage = $state(false);
  let assetsError = $state<string | null>(null);
  let firstAsset = $state<IMediaLibraryAsset | null>(null);

  async function handleLoadAssets(): Promise<void> {
    assetsError = null;
    try {
      const page = await getAssetsAsync({ first: 10 });
      assets = page.assets;
      totalCount = page.totalCount;
      hasNextPage = page.hasNextPage;
      firstAsset = page.assets[0] ?? null;
    } catch (reason) {
      assetsError = String(reason);
    }
  }

  const assetCountText = $derived(
    `${assets.length} of ${totalCount}${hasNextPage ? ' (more available)' : ''}`,
  );
  const assetListText = $derived(
    assets.map(asset => `${asset.filename} (${asset.mediaType})`).join(', '),
  );

  // Asset detail — the first asset card 4 loaded.
  let assetInfo = $state<IMediaLibraryAssetInfo | null>(null);
  let assetInfoError = $state<string | null>(null);
  let isFavorite = $state(false);
  let favoriteError = $state<string | null>(null);

  async function handleLoadAssetInfo(): Promise<void> {
    assetInfoError = null;
    if (!firstAsset) {
      assetInfoError = 'Load assets first.';
      return;
    }
    try {
      assetInfo = await getAssetInfoAsync(firstAsset);
      isFavorite = !!assetInfo.isFavorite;
    } catch (reason) {
      assetInfoError = String(reason);
    }
  }

  const assetInfoText = $derived(
    assetInfo
      ? [
          `localUri: ${assetInfo.localUri ?? '—'}`,
          `location: ${
            assetInfo.location
              ? `${assetInfo.location.latitude.toFixed(3)}, ${assetInfo.location.longitude.toFixed(3)}`
              : '—'
          }`,
          `isFavorite: ${assetInfo.isFavorite ?? '—'}`,
          `orientation: ${assetInfo.orientation ?? '—'}`,
        ].join('\n')
      : 'no asset info loaded yet',
  );

  async function handleToggleFavorite(): Promise<void> {
    favoriteError = null;
    if (!firstAsset) {
      favoriteError = 'Load assets first.';
      return;
    }
    try {
      await setAssetFavoriteAsync(firstAsset, !isFavorite);
      isFavorite = !isFavorite;
    } catch (reason) {
      favoriteError = String(reason);
    }
  }

  // Platform extra — iOS moments / Android content URI.
  let momentsCount = $state<number | null>(null);
  let momentsError = $state<string | null>(null);

  async function handleLoadMoments(): Promise<void> {
    momentsError = null;
    try {
      const moments = await getMomentsAsync();
      momentsCount = moments.length;
    } catch (reason) {
      momentsError = String(reason);
    }
  }

  let contentUri = $state<string | null>(null);
  let contentUriError = $state<string | null>(null);

  async function handleLoadContentUri(): Promise<void> {
    contentUriError = null;
    if (!firstAsset) {
      contentUriError = 'Load assets first.';
      return;
    }
    try {
      contentUri = await getAssetContentUriAsync(firstAsset);
    } catch (reason) {
      contentUriError = String(reason);
    }
  }

  // Change listener
  let isSubscribed = $state(false);
  let eventCount = $state(0);
  let lastEvent = $state<IMediaLibraryAssetsChangeEvent | null>(null);
  let subscription: ReturnType<typeof addListener> | null = null;

  function handleSubscribeToggle(): void {
    if (isSubscribed) {
      subscription?.remove();
      subscription = null;
      isSubscribed = false;
      return;
    }
    eventCount = 0;
    lastEvent = null;
    subscription = addListener(event => {
      eventCount += 1;
      lastEvent = event;
    });
    isSubscribed = true;
  }

  $effect(() => {
    return () => {
      subscription?.remove();
    };
  });

  const subscribeButtonTitle = $derived(
    isSubscribed ? 'Unsubscribe' : 'Subscribe',
  );
  const lastEventText = $derived(
    lastEvent
      ? `hasIncrementalChanges: ${lastEvent.hasIncrementalChanges}`
      : 'none yet',
  );

  // Modern API — Query / Asset / Album shared-object surface
  let modernPermissionText = $state<string | null>(null);
  let modernPermissionError = $state<string | null>(null);

  async function handleRequestModernPermission(): Promise<void> {
    modernPermissionError = null;
    try {
      const response = await requestModernPermissionsAsync(false, [
        ...GRANULAR_PERMISSIONS,
      ]);
      modernPermissionText = response.status;
    } catch (reason) {
      modernPermissionError = String(reason);
    }
  }

  let queryResultText = $state<string | null>(null);
  let queryError = $state<string | null>(null);
  let firstModernAsset: IModernAsset | null = null;

  async function handleRunQuery(): Promise<void> {
    queryError = null;
    try {
      const results = await new Query()
        .orderBy(AssetField.CREATION_TIME)
        .limit(QUERY_RESULT_LIMIT)
        .exe();
      firstModernAsset = results[0] ?? null;
      const filenames = await Promise.all(
        results.map(asset => asset.getFilename()),
      );
      queryResultText = `${results.length} result(s): ${filenames.join(', ') || 'none'}`;
    } catch (reason) {
      queryError = String(reason);
    }
  }

  let modernAssetDetailText = $state<string | null>(null);
  let modernAssetDetailError = $state<string | null>(null);

  async function handleLoadModernAssetDetail(): Promise<void> {
    modernAssetDetailError = null;
    if (!firstModernAsset) {
      modernAssetDetailError = 'Run query first.';
      return;
    }
    try {
      const [width, height, mediaType, favorite] = await Promise.all([
        firstModernAsset.getWidth(),
        firstModernAsset.getHeight(),
        firstModernAsset.getMediaType(),
        firstModernAsset.getFavorite(),
      ]);
      modernAssetDetailText = `${width}x${height} · ${mediaType} · favorite: ${favorite}`;
    } catch (reason) {
      modernAssetDetailError = String(reason);
    }
  }

  let modernAlbumsText = $state<string | null>(null);
  let modernAlbumsError = $state<string | null>(null);

  async function handleLoadModernAlbums(): Promise<void> {
    modernAlbumsError = null;
    try {
      const albumsResult = await ModernAlbum.getAll();
      const titles = await Promise.all(
        albumsResult.map(album => album.getTitle()),
      );
      modernAlbumsText = `${albumsResult.length} album(s): ${titles.join(', ') || 'none'}`;
    } catch (reason) {
      modernAlbumsError = String(reason);
    }
  }
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="media-library-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: lineColor }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Media Library</text>
        <text testID="media-library-hero" class="hero-body">
          @symbiote-native/media-library — permissions, albums, assets and
          library-change events over the device's existing photo/video library.
          Read-only demo: it never creates, saves, or deletes an asset.
        </text>
      </view>
    </view>
    <view testID="media-library-permissions-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Permissions</text>
      </view>
      <text testID="media-library-permission-status" class="auth-value-text">
        {permissionStatusText}
      </text>
      <view class="button-row">
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
      </view>{#if permissionError}<text class="auth-result-text">
          {permissionError}
        </text>{/if}
      <ActionButton
        testID="media-library-present-picker"
        title="Present permissions picker"
        onPress={handlePresentPicker}
        color={lineColor}
      />{#if presentPickerError}<text class="auth-result-text">
          {presentPickerError}
        </text>{/if}
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
      />{#if albumsError}<text class="auth-result-text">
          {albumsError}
        </text>{:else}<text
          testID="media-library-album-count"
          class="auth-value-text"
        >
          {albums.length} albums
        </text>
        <text testID="media-library-album-list" class="info-text">
          {albumListText || '(none loaded)'}
        </text>{/if}
    </view>
    <view testID="media-library-assets-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Assets</text>
      </view>
      <ActionButton
        testID="media-library-load-assets"
        title="Load first 10 assets"
        onPress={handleLoadAssets}
        color={lineColor}
      />{#if assetsError}<text class="auth-result-text">
          {assetsError}
        </text>{:else}<text
          testID="media-library-asset-count"
          class="auth-value-text"
        >
          {assetCountText}
        </text>
        <text testID="media-library-asset-list" class="info-text">
          {assetListText || '(none loaded)'}
        </text>{/if}
    </view>
    <view testID="media-library-asset-detail-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Asset detail</text>
      </view>
      <ActionButton
        testID="media-library-load-asset-info"
        title="Load first asset's info"
        onPress={handleLoadAssetInfo}
        color={lineColor}
      />{#if assetInfoError}<text class="auth-result-text">
          {assetInfoError}
        </text>{/if}
      <text testID="media-library-asset-info" class="info-text">
        {assetInfoText}
      </text>
      <ActionButton
        testID="media-library-toggle-favorite"
        title={isFavorite ? 'Unfavorite' : 'Favorite'}
        onPress={handleToggleFavorite}
        color={lineColor}
      />{#if favoriteError}<text class="auth-result-text">
          {favoriteError}
        </text>{/if}
    </view>
    <view testID="media-library-platform-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Platform extra</text>
      </view>{#if Platform.OS === 'ios'}<ActionButton
          testID="media-library-load-moments"
          title="Load moments"
          onPress={handleLoadMoments}
          color={lineColor}
        />{#if momentsError}<text class="auth-result-text">
            {momentsError}
          </text>{:else}<text
            testID="media-library-moments-count"
            class="auth-value-text"
          >
            {momentsCount === null
              ? 'not loaded yet'
              : `${momentsCount} moments`}
          </text>{/if}{:else}<ActionButton
          testID="media-library-load-content-uri"
          title="Load content URI"
          onPress={handleLoadContentUri}
          color={lineColor}
        />{#if contentUriError}<text class="auth-result-text">
            {contentUriError}
          </text>{:else}<text
            testID="media-library-content-uri"
            class="info-text"
          >
            {contentUri ?? 'not loaded yet'}
          </text>{/if}{/if}
    </view>
    <view testID="media-library-listener-card" class="auth-card">
      <view class="auth-card-header">
        <text class="auth-card-title">Change listener</text>
      </view>
      <ActionButton
        testID="media-library-subscribe-toggle"
        title={subscribeButtonTitle}
        onPress={handleSubscribeToggle}
        color={lineColor}
      />
      <text testID="media-library-event-count" class="auth-value-text">
        {eventCount} events
      </text>
      <text testID="media-library-last-event" class="info-text">
        {lastEventText}
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
      {#if modernPermissionError}
        <text class="auth-result-text">{modernPermissionError}</text>
      {:else}
        <text testID="media-library-modern-permission-result" class="info-text">
          {modernPermissionText ?? 'not requested yet'}
        </text>
      {/if}
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
      {#if queryError}
        <text class="auth-result-text">{queryError}</text>
      {:else}
        <text testID="media-library-query-result" class="info-text">
          {queryResultText ?? 'not run yet'}
        </text>
      {/if}
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
      {#if modernAssetDetailError}
        <text class="auth-result-text">{modernAssetDetailError}</text>
      {:else}
        <text testID="media-library-modern-asset-detail-result" class="info-text">
          {modernAssetDetailText ?? 'not loaded yet'}
        </text>
      {/if}
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
      {#if modernAlbumsError}
        <text class="auth-result-text">{modernAlbumsError}</text>
      {:else}
        <text testID="media-library-modern-albums-result" class="info-text">
          {modernAlbumsText ?? 'not loaded yet'}
        </text>
      {/if}
    </view>
  </scroll-view>
</safe-area-view>
