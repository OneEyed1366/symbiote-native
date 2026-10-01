import { Component } from '@angular/core';
import { Explorer } from '../components/Explorer';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { FileSystemLegacy } from './FileSystemLegacy';
import { FileSystemModern } from './FileSystemModern';
import { FileSystemNetwork } from './FileSystemNetwork';
import { FileSystemNote } from './FileSystemNote';

@Component({
  selector: 'FileSystemScreen',
  standalone: true,
  imports: [
    Explorer,
    FileSystemLegacy,
    FileSystemModern,
    FileSystemNetwork,
    FileSystemNote,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="file-system-scroll"
      title="File System"
      body="Read, write, copy, move and download files and folders in the app's own storage, with progress and cancellable transfers. Everything here stays inside this app's cache and documents folders."
    >
      <FileSystemNote />
      <Explorer testID="file-system-explorer" [color]="color">
        <ng-template>
          <FileSystemModern />
          <FileSystemNetwork />
          <FileSystemLegacy />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class FileSystemScreen {
  readonly route = ROUTE_NAME.FileSystem;
  readonly color = lineColorOf(ROUTE_NAME.FileSystem);
}
