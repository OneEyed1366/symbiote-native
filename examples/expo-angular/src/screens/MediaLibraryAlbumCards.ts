import { Component, input, signal } from '@angular/core';
import { Album, Asset } from '@symbiote-native/media-library/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { required } from './media-library-helpers';

@Component({
  selector: 'MediaLibraryAlbumCards',
  standalone: true,
  imports: [CallConsole, Card, Field, ToggleRow],
  template: `
    <Card testID="media-library-album-card" title="Album">
      <Field
        testID="media-library-album-input"
        label="album title"
        [(value)]="title"
      />
      <ToggleRow
        testID="media-library-move-switch"
        label="moveAssets (Album.create)"
        [(value)]="moveAssets"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="media-library-album-calls"
      title="Album calls"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class MediaLibraryAlbumCards {
  readonly assetId = input.required<string>();
  readonly color = lineColorOf(ROUTE_NAME.MediaLibrary);

  readonly title = signal('Symbiote Canary');
  readonly moveAssets = signal(false);

  private async album() {
    const found = await Album.get(this.title());
    if (found === null) {
      throw new Error(`no album titled ${this.title()}`);
    }
    return found;
  }

  private assetOf(): Asset {
    return new Asset(required(this.assetId(), 'asset id'));
  }

  readonly calls = [
    {
      label: 'Album.getAll',
      run: async () =>
        Promise.all(
          (await Album.getAll()).map(async item => ({
            id: item.id,
            title: await item.getTitle(),
          })),
        ),
    },
    { label: 'Album.get', run: async () => (await this.album()).id },
    { label: 'getTitle', run: async () => (await this.album()).getTitle() },
    {
      label: 'getAssets',
      run: async () =>
        (await (await this.album()).getAssets()).map(item => item.id),
    },
    {
      label: 'Album.create',
      run: async () =>
        (
          await Album.create(
            this.title(),
            [this.assetOf().id],
            this.moveAssets(),
          )
        ).id,
    },
    { label: 'add', run: async () => (await this.album()).add(this.assetOf()) },
    {
      label: 'removeAssets',
      run: async () => (await this.album()).removeAssets([this.assetOf()]),
    },
    { label: 'delete (album)', run: async () => (await this.album()).delete() },
    {
      label: 'Album.delete',
      run: async () => Album.delete([await this.album()]),
    },
  ];
}
