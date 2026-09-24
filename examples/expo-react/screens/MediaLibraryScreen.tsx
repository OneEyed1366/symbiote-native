import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from '@symbiote-native/react';
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
  IGranularPermission,
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
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const GRANULAR_PERMISSIONS: IGranularPermission[] = ['photo', 'video', 'audio'];
const QUERY_RESULT_LIMIT = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IAsyncResult<TValue> =
  | { status: 'success'; value: TValue }
  | { status: 'error'; message: string };

type IAssetsPage = {
  assets: IMediaLibraryAsset[];
  totalCount: number;
  hasNextPage: boolean;
};

function ResultBlock({ testID, result }: { testID: string; result: IAsyncResult<string> | null }) {
  if (!result) {
    return null;
  }
  return (
    <view
      testID={testID}
      className={`auth-result auth-result-${result.status === 'success' ? 'success' : 'error'}`}
    >
      <text className="auth-result-text">
        {result.status === 'success' ? result.value : `Failed: ${result.message}`}
      </text>
    </view>
  );
}

function formatCoordinate(value: number): string {
  return typeof value === 'number' ? value.toFixed(5) : String(value);
}

function describeAssetInfo(info: IMediaLibraryAssetInfo): string {
  return (
    `localUri: ${info.localUri ?? '—'}\n` +
    `location: ${
      info.location
        ? `${formatCoordinate(info.location.latitude)}, ${formatCoordinate(info.location.longitude)}`
        : '—'
    }\n` +
    `isFavorite: ${info.isFavorite ?? '—'}\n` +
    `orientation: ${info.orientation ?? '—'}`
  );
}

/**
 * @symbiote-native/media-library canary demo: permissions (incl. the limited-access picker),
 * albums, a paged asset list, per-asset info + favorite toggle, an iOS moments / Android
 * content-URI platform extra, and the library change-event listener. Deliberately read-only —
 * it never creates, saves, or deletes an asset, and only reads whatever already exists in the
 * simulator/device's library.
 */
export function MediaLibraryScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.MediaLibrary];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [permissionResponse, setPermissionResponse] =
    useState<IMediaLibraryPermissionResponse | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const handleRequestPermission = useCallback(() => {
    requestPermissionsAsync(false, GRANULAR_PERMISSIONS)
      .then(response => {
        setPermissionResponse(response);
        setPermissionError(null);
      })
      .catch(error => setPermissionError(errorMessage(error)));
  }, []);

  const handleGetPermission = useCallback(() => {
    getPermissionsAsync(false, GRANULAR_PERMISSIONS)
      .then(response => {
        setPermissionResponse(response);
        setPermissionError(null);
      })
      .catch(error => setPermissionError(errorMessage(error)));
  }, []);

  const handlePresentPicker = useCallback(() => {
    presentPermissionsPickerAsync()
      .then(() => setPickerError(null))
      .catch(error => setPickerError(errorMessage(error)));
  }, []);

  const [albumsResult, setAlbumsResult] = useState<IAsyncResult<IMediaLibraryAlbum[]> | null>(
    null,
  );

  const handleLoadAlbums = useCallback(() => {
    getAlbumsAsync()
      .then(albums => setAlbumsResult({ status: 'success', value: albums }))
      .catch(error => setAlbumsResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  const [assetsResult, setAssetsResult] = useState<IAsyncResult<IAssetsPage> | null>(null);
  const [firstAsset, setFirstAsset] = useState<IMediaLibraryAsset | null>(null);

  const handleLoadAssets = useCallback(() => {
    getAssetsAsync({ first: 10 })
      .then(page => {
        setAssetsResult({
          status: 'success',
          value: { assets: page.assets, totalCount: page.totalCount, hasNextPage: page.hasNextPage },
        });
        setFirstAsset(page.assets[0] ?? null);
      })
      .catch(error => setAssetsResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  const [assetInfoResult, setAssetInfoResult] =
    useState<IAsyncResult<IMediaLibraryAssetInfo> | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteResult, setFavoriteResult] = useState<IAsyncResult<string> | null>(null);

  const handleLoadAssetInfo = useCallback(() => {
    if (!firstAsset) {
      setAssetInfoResult({ status: 'error', message: 'Load assets first (Assets card above)' });
      return;
    }
    getAssetInfoAsync(firstAsset)
      .then(info => {
        setAssetInfoResult({ status: 'success', value: info });
        setIsFavorite(info.isFavorite ?? false);
      })
      .catch(error => setAssetInfoResult({ status: 'error', message: errorMessage(error) }));
  }, [firstAsset]);

  const handleToggleFavorite = useCallback(() => {
    if (!firstAsset) {
      setFavoriteResult({ status: 'error', message: 'Load assets first (Assets card above)' });
      return;
    }
    const nextFavorite = !isFavorite;
    setAssetFavoriteAsync(firstAsset, nextFavorite)
      .then(() => {
        setIsFavorite(nextFavorite);
        setFavoriteResult({
          status: 'success',
          value: nextFavorite ? 'Marked favorite' : 'Unmarked favorite',
        });
      })
      .catch(error => setFavoriteResult({ status: 'error', message: errorMessage(error) }));
  }, [firstAsset, isFavorite]);

  const [momentsCount, setMomentsCount] = useState<number | null>(null);
  const [momentsError, setMomentsError] = useState<string | null>(null);

  const handleLoadMoments = useCallback(() => {
    getMomentsAsync()
      .then(moments => {
        setMomentsCount(moments.length);
        setMomentsError(null);
      })
      .catch(error => {
        setMomentsError(errorMessage(error));
        setMomentsCount(null);
      });
  }, []);

  const [contentUri, setContentUri] = useState<string | null>(null);
  const [contentUriError, setContentUriError] = useState<string | null>(null);

  const handleLoadContentUri = useCallback(() => {
    if (!firstAsset) {
      setContentUriError('Load assets first (Assets card above)');
      return;
    }
    getAssetContentUriAsync(firstAsset)
      .then(uri => {
        setContentUri(uri);
        setContentUriError(null);
      })
      .catch(error => {
        setContentUriError(errorMessage(error));
        setContentUri(null);
      });
  }, [firstAsset]);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<IMediaLibraryAssetsChangeEvent | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof addListener> | null>(null);

  const handleToggleSubscribe = useCallback(() => {
    if (isSubscribed) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      setIsSubscribed(false);
      return;
    }
    subscriptionRef.current = addListener(event => {
      setEventCount(count => count + 1);
      setLastEvent(event);
    });
    setIsSubscribed(true);
  }, [isSubscribed]);

  useEffect(() => {
    return () => {
      subscriptionRef.current?.remove();
    };
  }, []);

  // --- modern: Query / Asset / Album shared-object surface ---
  const [modernPermissionResult, setModernPermissionResult] =
    useState<IAsyncResult<string> | null>(null);
  const [queryResult, setQueryResult] = useState<IAsyncResult<string> | null>(null);
  const firstModernAssetRef = useRef<IModernAsset | null>(null);
  const [assetDetailResult, setAssetDetailResult] =
    useState<IAsyncResult<string> | null>(null);
  const [modernAlbumsResult, setModernAlbumsResult] =
    useState<IAsyncResult<string> | null>(null);

  const handleRequestModernPermission = useCallback(() => {
    requestModernPermissionsAsync(false, GRANULAR_PERMISSIONS)
      .then(response =>
        setModernPermissionResult({ status: 'success', value: response.status }),
      )
      .catch(error =>
        setModernPermissionResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleRunQuery = useCallback(() => {
    new Query()
      .orderBy(AssetField.CREATION_TIME)
      .limit(QUERY_RESULT_LIMIT)
      .exe()
      .then(assets => {
        firstModernAssetRef.current = assets[0] ?? null;
        return Promise.all(assets.map(asset => asset.getFilename())).then(
          filenames => {
            setQueryResult({
              status: 'success',
              value: `${assets.length} result(s): ${filenames.join(', ') || 'none'}`,
            });
          },
        );
      })
      .catch(error => setQueryResult({ status: 'error', message: errorMessage(error) }));
  }, []);

  const handleLoadModernAssetDetail = useCallback(() => {
    const asset = firstModernAssetRef.current;
    if (!asset) {
      setAssetDetailResult({ status: 'error', message: 'Run query first (Query card above)' });
      return;
    }
    Promise.all([asset.getWidth(), asset.getHeight(), asset.getMediaType(), asset.getFavorite()])
      .then(([width, height, mediaType, favorite]) => {
        setAssetDetailResult({
          status: 'success',
          value: `${width}x${height} · ${mediaType} · favorite: ${favorite}`,
        });
      })
      .catch(error =>
        setAssetDetailResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  const handleLoadModernAlbums = useCallback(() => {
    ModernAlbum.getAll()
      .then(albums =>
        Promise.all(albums.map(album => album.getTitle())).then(titles => {
          setModernAlbumsResult({
            status: 'success',
            value: `${albums.length} album(s): ${titles.join(', ') || 'none'}`,
          });
        }),
      )
      .catch(error =>
        setModernAlbumsResult({ status: 'error', message: errorMessage(error) }),
      );
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="media-library-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view testID="media-library-hero" className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Media Library</text>
            <text className="hero-body">
              @symbiote-native/media-library — permissions, albums, assets, and
              library-change events. Read-only demo: it never creates, saves, or
              deletes an asset, only reads whatever already exists in the
              simulator/device's library.
            </text>
          </view>
        </view>

        <view testID="media-library-permissions-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Permissions</text>
          </view>
          <text testID="media-library-permission-status" className="auth-value-text">
            {permissionError
              ? `Failed: ${permissionError}`
              : permissionResponse
                ? `${permissionResponse.status}${
                    permissionResponse.accessPrivileges
                      ? ` (${permissionResponse.accessPrivileges})`
                      : ''
                  }`
                : 'not checked yet'}
          </text>
          <view className="button-row">
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
              title="Present picker"
              onPress={handlePresentPicker}
              color={lineColor}
            />
          </view>
          {pickerError ? (
            <text className="auth-result-text">{`Picker failed: ${pickerError}`}</text>
          ) : null}
        </view>

        <view testID="media-library-albums-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Albums</text>
          </view>
          <ActionButton
            testID="media-library-load-albums"
            title="Load albums"
            onPress={handleLoadAlbums}
            color={lineColor}
          />
          <text testID="media-library-album-count" className="auth-value-text">
            {!albumsResult
              ? 'Not loaded yet'
              : albumsResult.status === 'success'
                ? `${albumsResult.value.length} albums`
                : `Failed: ${albumsResult.message}`}
          </text>
          <text testID="media-library-album-list" className="info-text">
            {!albumsResult
              ? '—'
              : albumsResult.status === 'success'
                ? albumsResult.value.map(album => `${album.title} (${album.assetCount})`).join(', ') ||
                  'No albums'
                : `Failed: ${albumsResult.message}`}
          </text>
        </view>

        <view testID="media-library-assets-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Assets</text>
          </view>
          <ActionButton
            testID="media-library-load-assets"
            title="Load assets"
            onPress={handleLoadAssets}
            color={lineColor}
          />
          <text testID="media-library-asset-count" className="auth-value-text">
            {!assetsResult
              ? 'Not loaded yet'
              : assetsResult.status === 'success'
                ? `${assetsResult.value.assets.length} of ${assetsResult.value.totalCount}${
                    assetsResult.value.hasNextPage ? ' (more available)' : ''
                  }`
                : `Failed: ${assetsResult.message}`}
          </text>
          <text testID="media-library-asset-list" className="info-text">
            {!assetsResult
              ? '—'
              : assetsResult.status === 'success'
                ? assetsResult.value.assets
                    .map(asset => `${asset.filename} (${asset.mediaType})`)
                    .join(', ') || 'No assets'
                : `Failed: ${assetsResult.message}`}
          </text>
        </view>

        <view testID="media-library-asset-detail-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Asset detail</text>
          </view>
          <ActionButton
            testID="media-library-load-asset-info"
            title="Load asset info"
            onPress={handleLoadAssetInfo}
            color={lineColor}
          />
          <text testID="media-library-asset-info" className="info-text">
            {!assetInfoResult
              ? 'Not loaded yet'
              : assetInfoResult.status === 'success'
                ? describeAssetInfo(assetInfoResult.value)
                : `Failed: ${assetInfoResult.message}`}
          </text>
          <ActionButton
            testID="media-library-toggle-favorite"
            title={isFavorite ? 'Unmark favorite' : 'Mark favorite'}
            onPress={handleToggleFavorite}
            color={lineColor}
          />
          <ResultBlock testID="media-library-favorite-result" result={favoriteResult} />
        </view>

        {Platform.OS === 'ios' && (
          <view testID="media-library-platform-card" className="auth-card">
            <view className="auth-card-header">
              <text className="auth-card-title">Moments</text>
            </view>
            <ActionButton
              testID="media-library-load-moments"
              title="Load moments"
              onPress={handleLoadMoments}
              color={lineColor}
            />
            <text testID="media-library-moments-count" className="auth-value-text">
              {momentsError
                ? `Failed: ${momentsError}`
                : momentsCount === null
                  ? 'Not loaded yet'
                  : `${momentsCount} moments`}
            </text>
          </view>
        )}

        {Platform.OS === 'android' && (
          <view testID="media-library-platform-card" className="auth-card">
            <view className="auth-card-header">
              <text className="auth-card-title">Content URI</text>
            </view>
            <ActionButton
              testID="media-library-load-content-uri"
              title="Load content URI"
              onPress={handleLoadContentUri}
              color={lineColor}
            />
            <text testID="media-library-content-uri" className="auth-value-text">
              {contentUriError
                ? `Failed: ${contentUriError}`
                : (contentUri ?? 'Not loaded yet')}
            </text>
          </view>
        )}

        <view testID="media-library-listener-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Change listener</text>
          </view>
          <ActionButton
            testID="media-library-subscribe-toggle"
            title={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
            onPress={handleToggleSubscribe}
            color={lineColor}
          />
          <text testID="media-library-event-count" className="auth-value-text">
            {`${eventCount} event${eventCount === 1 ? '' : 's'} since subscribing`}
          </text>
          <text testID="media-library-last-event" className="info-text">
            {lastEvent ? `hasIncrementalChanges: ${lastEvent.hasIncrementalChanges}` : 'none yet'}
          </text>
        </view>

        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">
            Modern API — Query / Asset / Album (SDK-57 default surface)
          </text>
        </view>

        <view testID="media-library-modern-permission-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Modern permission</text>
          </view>
          <ActionButton
            testID="media-library-modern-request-permission"
            title="Request permission"
            onPress={handleRequestModernPermission}
            color={lineColor}
          />
          <ResultBlock
            testID="media-library-modern-permission-result"
            result={modernPermissionResult}
          />
        </view>

        <view testID="media-library-query-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Query</text>
          </view>
          <text className="info-text">
            {`new Query().orderBy(AssetField.CREATION_TIME).limit(${QUERY_RESULT_LIMIT}).exe()`}
          </text>
          <ActionButton
            testID="media-library-run-query"
            title="Run query"
            onPress={handleRunQuery}
            color={lineColor}
          />
          <ResultBlock testID="media-library-query-result" result={queryResult} />
        </view>

        <view testID="media-library-modern-asset-detail-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Asset detail (modern)</text>
          </view>
          <ActionButton
            testID="media-library-load-modern-asset-detail"
            title="Load first query result's detail"
            onPress={handleLoadModernAssetDetail}
            color={lineColor}
          />
          <ResultBlock
            testID="media-library-modern-asset-detail-result"
            result={assetDetailResult}
          />
        </view>

        <view testID="media-library-modern-albums-card" className="auth-card">
          <view className="auth-card-header">
            <text className="auth-card-title">Albums (modern)</text>
          </view>
          <ActionButton
            testID="media-library-load-modern-albums"
            title="Album.getAll()"
            onPress={handleLoadModernAlbums}
            color={lineColor}
          />
          <ResultBlock testID="media-library-modern-albums-result" result={modernAlbumsResult} />
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
