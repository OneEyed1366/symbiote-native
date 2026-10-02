import { Component, signal } from '@angular/core';
import { MediaLibraryAlbumCards } from './MediaLibraryAlbumCards';
import { MediaLibraryAssetCards } from './MediaLibraryAssetCards';
import { MediaLibraryListener } from './MediaLibraryListener';
import { MediaLibraryPermissions } from './MediaLibraryPermissions';
import { MediaLibraryQuery } from './MediaLibraryQuery';

@Component({
  selector: 'MediaLibraryModern',
  standalone: true,
  imports: [
    MediaLibraryAlbumCards,
    MediaLibraryAssetCards,
    MediaLibraryListener,
    MediaLibraryPermissions,
    MediaLibraryQuery,
  ],
  template: `
    <MediaLibraryPermissions />
    <MediaLibraryQuery [(assetId)]="assetId" />
    <MediaLibraryAssetCards [(assetId)]="assetId" />
    <MediaLibraryAlbumCards [assetId]="assetId()" />
    <MediaLibraryListener />
  `,
})
export class MediaLibraryModern {
  readonly assetId = signal('');
}
