import { Component, OnDestroy, signal } from '@angular/core';
import { Platform, SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
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
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const QUERY_RESULT_LIMIT = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IAssetsSummary = {
  assets: IMediaLibraryAsset[];
  totalCount: number;
  hasNextPage: boolean;
};

/**
 * @symbiote-native/media-library canary demo: permissions (incl. the limited-access picker),
 * albums, a paged asset query, per-asset detail + favorite toggle, an iOS-only "moments" query /
 * Android-only content-URI lookup, and a live library-change listener. READ-ONLY — this demo never
 * creates, saves, deletes, or picks an asset (no camera/image-picker dependency in this app); it
 * only reads whatever photos/videos already exist in the simulator/device's library. Same
 * imperative shape as LocationScreen — no Angular service wrapper exists for this package.
 */
@Component({
  selector: 'MediaLibraryScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="media-library-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Media Library</text>
            <text testID="media-library-hero" class="hero-body">
              @symbiote-native/media-library — photo/video library assets,
              albums, permissions and change events. Reads whatever the
              simulator/device already has in its library; never creates, saves,
              or deletes anything.
            </text>
          </view>
        </view>

        <view testID="media-library-permissions-card" class="capability-card">
          <text class="capability-card-title">Permissions</text>
          <view class="capability-row">
            <text class="capability-label">Status</text>
            <text testID="media-library-permission-status" class="value-text">{{
              permissionStatusLabel()
            }}</text>
          </view>
          <ActionButton
            testID="media-library-request-permission"
            title="Request permission"
            (press)="requestPermission()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="media-library-get-permission"
            title="Get permission"
            (press)="getPermission()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="media-library-present-picker"
            title="Present picker"
            (press)="presentPicker()"
            [color]="lineColor"
          ></ActionButton>
          @if (pickerError(); as message) {
            <view class="auth-result auth-result-error">
              <text class="auth-result-text">{{ message }}</text>
            </view>
          }
        </view>

        <view testID="media-library-albums-card" class="capability-card">
          <text class="capability-card-title">Albums</text>
          <ActionButton
            testID="media-library-load-albums"
            title="Load albums"
            (press)="loadAlbums()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="media-library-album-count" class="value-text">{{
            albumCountLabel()
          }}</text>
          <text testID="media-library-album-list" class="capability-label">{{
            albumListLabel()
          }}</text>
        </view>

        <view testID="media-library-assets-card" class="capability-card">
          <text class="capability-card-title">Assets</text>
          <ActionButton
            testID="media-library-load-assets"
            title="Load assets"
            (press)="loadAssets()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="media-library-asset-count" class="value-text">{{
            assetCountLabel()
          }}</text>
          <text testID="media-library-asset-list" class="capability-label">{{
            assetListLabel()
          }}</text>
        </view>

        <view testID="media-library-asset-detail-card" class="capability-card">
          <text class="capability-card-title">Asset detail</text>
          <ActionButton
            testID="media-library-load-asset-info"
            title="Load asset info"
            (press)="loadAssetInfo()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="media-library-asset-info" class="capability-label">{{
            assetInfoLabel()
          }}</text>
          <ActionButton
            testID="media-library-toggle-favorite"
            [title]="toggleFavoriteTitle()"
            (press)="toggleFavorite()"
            [color]="lineColor"
          ></ActionButton>
          @if (favoriteError(); as message) {
            <view class="auth-result auth-result-error">
              <text class="auth-result-text">{{ message }}</text>
            </view>
          }
        </view>

        @if (Platform.OS === 'ios') {
          <view testID="media-library-moments-card" class="capability-card">
            <text class="capability-card-title">Moments</text>
            <ActionButton
              testID="media-library-load-moments"
              title="Load moments"
              (press)="loadMoments()"
              [color]="lineColor"
            ></ActionButton>
            <text testID="media-library-moments-count" class="value-text">{{
              momentsCountLabel()
            }}</text>
          </view>
        }
        @if (Platform.OS === 'android') {
          <view testID="media-library-content-uri-card" class="capability-card">
            <text class="capability-card-title">Content URI</text>
            <ActionButton
              testID="media-library-load-content-uri"
              title="Load content URI"
              (press)="loadContentUri()"
              [color]="lineColor"
            ></ActionButton>
            <text testID="media-library-content-uri" class="capability-label">{{
              contentUriLabel()
            }}</text>
          </view>
        }

        <view testID="media-library-listener-card" class="capability-card">
          <text class="capability-card-title">Change listener</text>
          <ActionButton
            testID="media-library-subscribe-toggle"
            [title]="subscribeToggleTitle()"
            (press)="toggleSubscription()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="media-library-event-count" class="value-text">{{
            eventCountLabel()
          }}</text>
          <text testID="media-library-last-event" class="capability-label">{{
            lastEventLabel()
          }}</text>
        </view>

        <text class="menu-eyebrow"
          >MODERN API (Query / Asset / Album, SDK-57 default surface)</text
        >

        <view
          testID="media-library-modern-permission-card"
          class="capability-card"
        >
          <text class="capability-card-title">Modern permission</text>
          <ActionButton
            testID="media-library-modern-request-permission"
            title="Request permission"
            (press)="requestModernPermission()"
            [color]="lineColor"
          ></ActionButton>
          <text
            testID="media-library-modern-permission-result"
            class="value-text"
            >{{ modernPermissionLabel() }}</text
          >
        </view>

        <view testID="media-library-query-card" class="capability-card">
          <text class="capability-card-title">Query</text>
          <text class="capability-label">{{
            'new Query().orderBy(AssetField.CREATION_TIME).limit(' +
              queryResultLimit +
              ').exe()'
          }}</text>
          <ActionButton
            testID="media-library-run-query"
            title="Run query"
            (press)="runQuery()"
            [color]="lineColor"
          ></ActionButton>
          <text testID="media-library-query-result" class="value-text">{{
            queryResultLabel()
          }}</text>
        </view>

        <view
          testID="media-library-modern-asset-detail-card"
          class="capability-card"
        >
          <text class="capability-card-title">Asset detail (modern)</text>
          <ActionButton
            testID="media-library-load-modern-asset-detail"
            title="Load first query result's detail"
            (press)="loadModernAssetDetail()"
            [color]="lineColor"
          ></ActionButton>
          <text
            testID="media-library-modern-asset-detail-result"
            class="value-text"
            >{{ modernAssetDetailLabel() }}</text
          >
        </view>

        <view testID="media-library-modern-albums-card" class="capability-card">
          <text class="capability-card-title">Albums (modern)</text>
          <ActionButton
            testID="media-library-load-modern-albums"
            title="Album.getAll()"
            (press)="loadModernAlbums()"
            [color]="lineColor"
          ></ActionButton>
          <text
            testID="media-library-modern-albums-result"
            class="value-text"
            >{{ modernAlbumsLabel() }}</text
          >
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class MediaLibraryScreen implements OnDestroy {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.MediaLibrary];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };
  readonly Platform = Platform;

  readonly permissionResponse = signal<IMediaLibraryPermissionResponse | null>(
    null,
  );
  readonly pickerError = signal<string | null>(null);

  readonly albums = signal<IMediaLibraryAlbum[] | null>(null);

  readonly assetsSummary = signal<IAssetsSummary | null>(null);
  private readonly firstAsset = signal<IMediaLibraryAsset | null>(null);

  readonly assetInfo = signal<IMediaLibraryAssetInfo | null>(null);
  readonly favoriteError = signal<string | null>(null);
  private readonly isFavorite = signal(false);

  readonly moments = signal<IMediaLibraryAlbum[] | null>(null);
  readonly contentUri = signal<string | null>(null);
  readonly contentUriError = signal<string | null>(null);

  readonly isSubscribed = signal(false);
  readonly eventCount = signal(0);
  readonly lastEvent = signal<IMediaLibraryAssetsChangeEvent | null>(null);
  private subscription: ReturnType<typeof addListener> | null = null;

  ngOnDestroy(): void {
    this.subscription?.remove();
  }

  async requestPermission(): Promise<void> {
    try {
      const response = await requestPermissionsAsync(false, [
        'photo',
        'video',
        'audio',
      ]);
      this.permissionResponse.set(response);
    } catch (error) {
      this.pickerError.set(errorMessage(error));
    }
  }

  async getPermission(): Promise<void> {
    try {
      const response = await getPermissionsAsync(false, [
        'photo',
        'video',
        'audio',
      ]);
      this.permissionResponse.set(response);
    } catch (error) {
      this.pickerError.set(errorMessage(error));
    }
  }

  async presentPicker(): Promise<void> {
    try {
      await presentPermissionsPickerAsync();
      this.pickerError.set(null);
    } catch (error) {
      this.pickerError.set(errorMessage(error));
    }
  }

  async loadAlbums(): Promise<void> {
    try {
      this.albums.set(await getAlbumsAsync());
    } catch {
      this.albums.set(null);
    }
  }

  async loadAssets(): Promise<void> {
    try {
      const page = await getAssetsAsync({ first: 10 });
      this.assetsSummary.set({
        assets: page.assets,
        totalCount: page.totalCount,
        hasNextPage: page.hasNextPage,
      });
      this.firstAsset.set(page.assets[0] ?? null);
    } catch {
      this.assetsSummary.set(null);
    }
  }

  async loadAssetInfo(): Promise<void> {
    const asset = this.firstAsset();
    if (!asset) {
      this.favoriteError.set('No asset loaded yet — use "Load assets" first.');
      return;
    }
    try {
      const info = await getAssetInfoAsync(asset);
      this.assetInfo.set(info);
      this.isFavorite.set(!!info.isFavorite);
      this.favoriteError.set(null);
    } catch (error) {
      this.favoriteError.set(errorMessage(error));
    }
  }

  async toggleFavorite(): Promise<void> {
    const asset = this.firstAsset();
    if (!asset) {
      this.favoriteError.set('No asset loaded yet — use "Load assets" first.');
      return;
    }
    try {
      const nextFavorite = !this.isFavorite();
      await setAssetFavoriteAsync(asset, nextFavorite);
      this.isFavorite.set(nextFavorite);
      this.favoriteError.set(null);
    } catch (error) {
      this.favoriteError.set(errorMessage(error));
    }
  }

  async loadMoments(): Promise<void> {
    try {
      this.moments.set(await getMomentsAsync());
    } catch {
      this.moments.set(null);
    }
  }

  async loadContentUri(): Promise<void> {
    const asset = this.firstAsset();
    if (!asset) {
      this.contentUriError.set(
        'No asset loaded yet — use "Load assets" first.',
      );
      return;
    }
    try {
      this.contentUri.set(await getAssetContentUriAsync(asset));
      this.contentUriError.set(null);
    } catch (error) {
      this.contentUriError.set(errorMessage(error));
    }
  }

  toggleSubscription(): void {
    if (this.isSubscribed()) {
      this.subscription?.remove();
      this.subscription = null;
      this.isSubscribed.set(false);
      return;
    }
    this.subscription = addListener(event => {
      this.eventCount.set(this.eventCount() + 1);
      this.lastEvent.set(event);
    });
    this.isSubscribed.set(true);
  }

  permissionStatusLabel(): string {
    const response = this.permissionResponse();
    if (!response) return 'not checked yet';
    return response.accessPrivileges
      ? `${response.status} (${response.accessPrivileges})`
      : response.status;
  }

  albumCountLabel(): string {
    return `${this.albums()?.length ?? 0} albums`;
  }

  albumListLabel(): string {
    const albums = this.albums();
    if (!albums || albums.length === 0) return '—';
    return albums
      .map(album => `${album.title} (${album.assetCount})`)
      .join(', ');
  }

  assetCountLabel(): string {
    const summary = this.assetsSummary();
    if (!summary) return 'not loaded yet';
    const more = summary.hasNextPage ? ', more available' : '';
    return `${summary.assets.length} of ${summary.totalCount}${more}`;
  }

  assetListLabel(): string {
    const summary = this.assetsSummary();
    if (!summary || summary.assets.length === 0) return '—';
    return summary.assets
      .map(asset => `${asset.filename} (${asset.mediaType})`)
      .join(', ');
  }

  assetInfoLabel(): string {
    const info = this.assetInfo();
    if (!info) return 'No asset info loaded yet.';
    const parts = [
      `localUri: ${info.localUri ?? '—'}`,
      `location: ${
        info.location
          ? `${info.location.latitude}, ${info.location.longitude}`
          : '—'
      }`,
      `isFavorite: ${info.isFavorite ?? '—'}`,
      `orientation: ${info.orientation ?? '—'}`,
    ];
    return parts.join(' · ');
  }

  toggleFavoriteTitle(): string {
    return this.isFavorite() ? 'Unfavorite' : 'Favorite';
  }

  momentsCountLabel(): string {
    const moments = this.moments();
    return moments === null ? 'not loaded yet' : `${moments.length} moments`;
  }

  contentUriLabel(): string {
    return this.contentUriError() ?? this.contentUri() ?? 'not loaded yet';
  }

  subscribeToggleTitle(): string {
    return this.isSubscribed() ? 'Unsubscribe' : 'Subscribe';
  }

  eventCountLabel(): string {
    return `${this.eventCount()} events since subscribing`;
  }

  lastEventLabel(): string {
    const event = this.lastEvent();
    return event
      ? `hasIncrementalChanges: ${event.hasIncrementalChanges}`
      : 'none yet';
  }

  // --- modern: Query / Asset / Album shared-object surface ---
  readonly queryResultLimit = QUERY_RESULT_LIMIT;
  private readonly modernPermissionStatus = signal<string | null>(null);
  private readonly queryResultText = signal<string | null>(null);
  private firstModernAsset: IModernAsset | null = null;
  private readonly modernAssetDetailText = signal<string | null>(null);
  private readonly modernAlbumsText = signal<string | null>(null);

  async requestModernPermission(): Promise<void> {
    try {
      const response = await requestModernPermissionsAsync(false, [
        'photo',
        'video',
        'audio',
      ]);
      this.modernPermissionStatus.set(response.status);
    } catch (error) {
      this.modernPermissionStatus.set(`Failed: ${errorMessage(error)}`);
    }
  }

  async runQuery(): Promise<void> {
    try {
      const results = await new Query()
        .orderBy(AssetField.CREATION_TIME)
        .limit(QUERY_RESULT_LIMIT)
        .exe();
      this.firstModernAsset = results[0] ?? null;
      const filenames = await Promise.all(
        results.map(asset => asset.getFilename()),
      );
      this.queryResultText.set(
        `${results.length} result(s): ${filenames.join(', ') || 'none'}`,
      );
    } catch (error) {
      this.queryResultText.set(`Failed: ${errorMessage(error)}`);
    }
  }

  async loadModernAssetDetail(): Promise<void> {
    if (!this.firstModernAsset) {
      this.modernAssetDetailText.set('run query first');
      return;
    }
    try {
      const [width, height, mediaType, favorite] = await Promise.all([
        this.firstModernAsset.getWidth(),
        this.firstModernAsset.getHeight(),
        this.firstModernAsset.getMediaType(),
        this.firstModernAsset.getFavorite(),
      ]);
      this.modernAssetDetailText.set(
        `${width}x${height} · ${mediaType} · favorite: ${favorite}`,
      );
    } catch (error) {
      this.modernAssetDetailText.set(`Failed: ${errorMessage(error)}`);
    }
  }

  async loadModernAlbums(): Promise<void> {
    try {
      const albumsResult = await ModernAlbum.getAll();
      const titles = await Promise.all(
        albumsResult.map(album => album.getTitle()),
      );
      this.modernAlbumsText.set(
        `${albumsResult.length} album(s): ${titles.join(', ') || 'none'}`,
      );
    } catch (error) {
      this.modernAlbumsText.set(`Failed: ${errorMessage(error)}`);
    }
  }

  modernPermissionLabel(): string {
    return this.modernPermissionStatus() ?? 'not requested yet';
  }

  queryResultLabel(): string {
    return this.queryResultText() ?? 'not run yet';
  }

  modernAssetDetailLabel(): string {
    return this.modernAssetDetailText() ?? 'not loaded yet';
  }

  modernAlbumsLabel(): string {
    return this.modernAlbumsText() ?? 'not loaded yet';
  }
}
