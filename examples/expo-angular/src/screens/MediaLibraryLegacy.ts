import { Component, DestroyRef, inject, signal } from '@angular/core';
import * as Legacy from '@symbiote-native/media-library/legacy';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
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

@Component({
  selector: 'MediaLibraryLegacy',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card
      testID="media-library-legacy-assets-card"
      title="getAssetsAsync options"
    >
      <Field
        testID="media-library-first-input"
        label="first"
        [value]="form().first"
        (valueChange)="patch({ first: $event })"
      />
      <Field
        testID="media-library-after-input"
        label="after (asset id)"
        [value]="form().after"
        (valueChange)="patch({ after: $event })"
      />
      <Field
        testID="media-library-legacy-album-input"
        label="album (id)"
        [value]="form().album"
        (valueChange)="patch({ album: $event })"
      />
      <ChoiceRow
        testID="media-library-sort-by"
        label="sortBy (SortBy key)"
        [options]="sortChoices"
        [value]="form().sortBy"
        (valueChange)="patch({ sortBy: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="media-library-sort-asc-switch"
        label="sortBy ascending"
        [value]="form().isAscending"
        (valueChange)="patch({ isAscending: $event })"
        [color]="color"
      />
      <ChoiceRow
        testID="media-library-legacy-media-type"
        label="mediaType (MediaType)"
        [options]="mediaTypeChoices"
        [value]="form().mediaType"
        (valueChange)="patch({ mediaType: $event })"
        [color]="color"
      />
      <Field
        testID="media-library-subtypes-input"
        label="mediaSubtypes (comma separated, iOS)"
        [value]="form().mediaSubtypes"
        (valueChange)="patch({ mediaSubtypes: $event })"
      />
      <Field
        testID="media-library-after-date-input"
        label="createdAfter (ms)"
        [value]="form().createdAfter"
        (valueChange)="patch({ createdAfter: $event })"
      />
      <Field
        testID="media-library-before-date-input"
        label="createdBefore (ms)"
        [value]="form().createdBefore"
        (valueChange)="patch({ createdBefore: $event })"
      />
      <ToggleRow
        testID="media-library-full-info-switch"
        label="resolveWithFullInfo"
        [value]="form().resolveWithFullInfo"
        (valueChange)="patch({ resolveWithFullInfo: $event })"
        [color]="color"
      />
    </Card>
    <Card testID="media-library-legacy-ids-card" title="Legacy ids and flags">
      <Field
        testID="media-library-legacy-asset-input"
        label="asset id"
        [(value)]="assetId"
      />
      <Field
        testID="media-library-legacy-album-id-input"
        label="album id"
        [(value)]="albumId"
      />
      <Field
        testID="media-library-legacy-uri-input"
        label="localUri for createAssetAsync and saveToLibraryAsync"
        [(value)]="localUri"
      />
      <Field
        testID="media-library-legacy-album-name-input"
        label="albumName for createAlbumAsync"
        [(value)]="albumName"
      />
      <ToggleRow
        testID="media-library-smart-switch"
        label="includeSmartAlbums"
        [(value)]="includeSmart"
        [color]="color"
      />
      <ToggleRow
        testID="media-library-download-switch"
        label="shouldDownloadFromNetwork"
        [(value)]="shouldDownload"
        [color]="color"
      />
      <ToggleRow
        testID="media-library-copy-switch"
        label="copy (addAssetsToAlbumAsync, createAlbumAsync)"
        [(value)]="isCopy"
        [color]="color"
      />
      <ToggleRow
        testID="media-library-legacy-listener-switch"
        label="addListener / removeAllListeners"
        [value]="isListening()"
        (valueChange)="toggleListener($event)"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="media-library-legacy-calls"
      title="Legacy function API"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class MediaLibraryLegacy {
  readonly color = lineColorOf(ROUTE_NAME.MediaLibrary);
  readonly sortChoices = toChoices(SORT_KEYS);
  readonly mediaTypeChoices = toChoices(MEDIA_TYPES);

  readonly form = signal<IAssetsForm>({ ...INITIAL_ASSETS_FORM });
  readonly assetId = signal('');
  readonly albumId = signal('');
  readonly localUri = signal('');
  readonly albumName = signal('Symbiote Legacy');
  readonly includeSmart = signal(false);
  readonly shouldDownload = signal(true);
  readonly isCopy = signal(true);
  readonly isListening = signal(false);
  private subscription: ReturnType<typeof Legacy.addListener> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.subscription?.remove();
      this.subscription = null;
    });
  }

  patch(change: Partial<IAssetsForm>): void {
    this.form.update(current => ({ ...current, ...change }));
  }

  private asset(): string {
    return required(this.assetId(), 'asset id');
  }

  private album(): string {
    return required(this.albumId(), 'album id');
  }

  private uri(): string {
    return required(this.localUri(), 'localUri');
  }

  toggleListener(next: boolean): void {
    this.isListening.set(next);
    if (next) {
      this.subscription = Legacy.addListener(() => undefined);
    } else {
      this.subscription?.remove();
      Legacy.removeAllListeners();
    }
  }

  readonly calls = [
    { label: 'isAvailableAsync', run: () => Legacy.isAvailableAsync() },
    { label: 'getPermissionsAsync', run: () => Legacy.getPermissionsAsync() },
    {
      label: 'requestPermissionsAsync',
      run: () => Legacy.requestPermissionsAsync(),
    },
    {
      label: 'presentPermissionsPickerAsync',
      run: () => Legacy.presentPermissionsPickerAsync(),
    },
    {
      label: 'getAssetsAsync',
      run: async () => {
        const page = await Legacy.getAssetsAsync(toAssetsOptions(this.form()));
        this.assetId.set(page.assets[0]?.id ?? this.assetId());
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
      run: () =>
        Legacy.getAssetInfoAsync(this.asset(), {
          shouldDownloadFromNetwork: this.shouldDownload(),
        }),
    },
    {
      label: 'getAssetContentUriAsync (Android)',
      run: () => Legacy.getAssetContentUriAsync(this.asset()),
    },
    {
      label: 'setAssetFavoriteAsync (iOS)',
      run: () => Legacy.setAssetFavoriteAsync(this.asset(), true),
    },
    {
      label: 'createAssetAsync',
      run: async () => (await Legacy.createAssetAsync(this.uri())).id,
    },
    {
      label: 'saveToLibraryAsync',
      run: () => Legacy.saveToLibraryAsync(this.uri()),
    },
    {
      label: 'deleteAssetsAsync',
      run: () => Legacy.deleteAssetsAsync([this.asset()]),
    },
    {
      label: 'getAlbumsAsync',
      run: async () => {
        const albums = await Legacy.getAlbumsAsync({
          includeSmartAlbums: this.includeSmart(),
        });
        this.albumId.set(albums[0]?.id ?? this.albumId());
        return albums.map(item => ({
          id: item.id,
          title: item.title,
          count: item.assetCount,
        }));
      },
    },
    {
      label: 'getAlbumAsync',
      run: () => Legacy.getAlbumAsync(this.albumName()),
    },
    {
      label: 'createAlbumAsync',
      run: async () => {
        const localUri = this.localUri().trim();
        const created = await Legacy.createAlbumAsync(
          this.albumName(),
          this.asset(),
          this.isCopy(),
          localUri === '' ? undefined : localUri,
        );
        this.albumId.set(created.id);
        return created.id;
      },
    },
    {
      label: 'addAssetsToAlbumAsync',
      run: () =>
        Legacy.addAssetsToAlbumAsync(
          [this.asset()],
          this.album(),
          this.isCopy(),
        ),
    },
    {
      label: 'removeAssetsFromAlbumAsync',
      run: () =>
        Legacy.removeAssetsFromAlbumAsync([this.asset()], this.album()),
    },
    {
      label: 'deleteAlbumsAsync',
      run: () => Legacy.deleteAlbumsAsync([this.album()]),
    },
    { label: 'getMomentsAsync (iOS)', run: () => Legacy.getMomentsAsync() },
    {
      label: 'albumNeedsMigrationAsync (iOS)',
      run: () => Legacy.albumNeedsMigrationAsync(this.album()),
    },
    {
      label: 'migrateAlbumIfNeededAsync (iOS)',
      run: () => Legacy.migrateAlbumIfNeededAsync(this.album()),
    },
    {
      label: 'MediaType and SortBy constants',
      run: async () => ({ MediaType: Legacy.MediaType, SortBy: Legacy.SortBy }),
    },
  ];
}
