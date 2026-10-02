import { Component, model, signal } from '@angular/core';
import { Album, Asset } from '@symbiote-native/media-library/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { required } from './media-library-helpers';

@Component({
  selector: 'MediaLibraryAssetCards',
  standalone: true,
  imports: [CallConsole, Card, Field],
  template: `
    <Card testID="media-library-asset-card" title="Asset">
      <Field
        testID="media-library-asset-id-input"
        label="asset id"
        [(value)]="assetId"
      />
      <Field
        testID="media-library-file-input"
        label="file uri for Asset.create"
        [(value)]="filePath"
        placeholder="file:///…/photo.jpg"
      />
      <Field
        testID="media-library-create-album-input"
        label="album title (optional)"
        [(value)]="albumTitle"
      />
    </Card>
    <CallConsole
      prefix="media-library-asset-getters"
      title="Asset getters"
      [color]="color"
      [calls]="getterCalls"
    />
    <CallConsole
      prefix="media-library-asset-actions"
      title="Asset actions"
      [color]="color"
      hint="Asset.create saves a file into the library, delete removes it for good."
      [calls]="actionCalls"
    />
  `,
})
export class MediaLibraryAssetCards {
  readonly assetId = model.required<string>();
  readonly color = lineColorOf(ROUTE_NAME.MediaLibrary);

  readonly filePath = signal('');
  readonly albumTitle = signal('');

  private asset(): Asset {
    return new Asset(required(this.assetId(), 'asset id'));
  }

  readonly getterCalls = [
    { label: 'getFilename', run: () => this.asset().getFilename() },
    { label: 'getUri', run: () => this.asset().getUri() },
    { label: 'getMediaType', run: () => this.asset().getMediaType() },
    { label: 'getMediaSubtypes', run: () => this.asset().getMediaSubtypes() },
    { label: 'getWidth', run: () => this.asset().getWidth() },
    { label: 'getHeight', run: () => this.asset().getHeight() },
    { label: 'getShape', run: () => this.asset().getShape() },
    { label: 'getDuration', run: () => this.asset().getDuration() },
    { label: 'getCreationTime', run: () => this.asset().getCreationTime() },
    {
      label: 'getModificationTime',
      run: () => this.asset().getModificationTime(),
    },
    { label: 'getOrientation (iOS)', run: () => this.asset().getOrientation() },
    { label: 'getIsInCloud (iOS)', run: () => this.asset().getIsInCloud() },
    {
      label: 'getLivePhotoVideoUri (iOS)',
      run: () => this.asset().getLivePhotoVideoUri(),
    },
    { label: 'getLocation', run: () => this.asset().getLocation() },
    { label: 'getExif', run: () => this.asset().getExif() },
    { label: 'getInfo', run: () => this.asset().getInfo() },
    {
      label: 'getAlbums',
      run: async () =>
        Promise.all(
          (await this.asset().getAlbums()).map(async item => ({
            id: item.id,
            title: await item.getTitle(),
          })),
        ),
    },
    { label: 'getFavorite (iOS)', run: () => this.asset().getFavorite() },
  ];

  readonly actionCalls = [
    { label: 'setFavorite (iOS)', run: () => this.asset().setFavorite(true) },
    {
      label: 'Asset.create',
      run: async () => {
        const title = this.albumTitle().trim();
        const album =
          title === '' ? undefined : ((await Album.get(title)) ?? undefined);
        const created = await Asset.create(
          required(this.filePath(), 'file uri'),
          album,
        );
        this.assetId.set(created.id);
        return created.id;
      },
    },
    { label: 'delete (instance)', run: () => this.asset().delete() },
    { label: 'Asset.delete', run: () => Asset.delete([this.asset()]) },
  ];
}
