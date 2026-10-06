import { Component, signal } from '@angular/core';
import { Platform } from '@symbiote-native/angular';
import type { ILivePhotoAsset } from '@symbiote-native/live-photo/angular';
import { ResultRow } from '../components/ResultRow';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { LivePhotoLibraryScenario } from './LivePhotoLibraryScenario';
import { LivePhotoPickScenario } from './LivePhotoPickScenario';
import { LivePhotoPlayer } from './LivePhotoPlayer';

const ROUTE = ROUTE_NAME.LivePhoto;
const IOS_OS = 'ios';

@Component({
  selector: 'LivePhotoScreen',
  standalone: true,
  imports: [
    LivePhotoLibraryScenario,
    LivePhotoPickScenario,
    LivePhotoPlayer,
    ResultRow,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="live-photo-scroll"
      title="Live Photo"
      body="iOS only: show an Apple Live Photo, play its motion on a press and react to loading and playback events. It needs a Live Photo on the device, take one with the Camera app."
    >
      @if (!isIos) {
        <ResultRow
          testID="live-photo-platform"
          label="Platform"
          value="Live Photos exist on iOS only, the view renders nothing here"
        />
      }
      <LivePhotoPickScenario [color]="color" (picked)="source.set($event)" />
      <LivePhotoLibraryScenario [color]="color" (found)="source.set($event)" />
      <LivePhotoPlayer [source]="source()" [color]="color" />
    </ScreenShell>
  `,
})
export class LivePhotoScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
  readonly isIos = Platform.OS === IOS_OS;
  readonly source = signal<ILivePhotoAsset | null>(null);
}
