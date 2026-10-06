import { Component, signal } from '@angular/core';
import { ResultRow } from '../components/ResultRow';
import { Card } from '../components/Card';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { BasicScenario } from './BasicScenario';
import { CacheScenario } from './CacheScenario';
import { CustomControlsScenario } from './CustomControlsScenario';
import { FeedScenario } from './FeedScenario';
import { FullscreenScenario } from './FullscreenScenario';
import { PlayerExplorer } from './PlayerExplorer';
import { ReelsScenario } from './ReelsScenario';
import { ThumbnailsScenario } from './ThumbnailsScenario';
import { TracksScenario } from './TracksScenario';

const ROUTE = ROUTE_NAME.Video;

@Component({
  selector: 'VideoScreen',
  standalone: true,
  imports: [
    BasicScenario,
    CacheScenario,
    Card,
    CustomControlsScenario,
    FeedScenario,
    FullscreenScenario,
    PlayerExplorer,
    ReelsScenario,
    ResultRow,
    ScreenShell,
    ThumbnailsScenario,
    ToggleRow,
    TracksScenario,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="video-scroll"
      title="Video"
      body="expo-video: a native player object plus a view. System or custom controls, feeds, fullscreen, picture in picture, thumbnails, tracks and an on-disk cache."
    >
      <Card testID="video-mount-card" title="Players on this screen">
        <ToggleRow
          testID="video-mount"
          label="Mount the players below"
          [color]="color"
          [(value)]="isMounted"
        />
        <ResultRow
          testID="video-mount-state"
          label="Why"
          value="the cache calls work only while no player exists"
        />
      </Card>
      @if (isMounted()) {
        <BasicScenario />
        <CustomControlsScenario [color]="color" />
        <FeedScenario [color]="color" />
        <ReelsScenario [color]="color" />
        <FullscreenScenario [color]="color" />
        <ThumbnailsScenario [color]="color" />
        <TracksScenario [color]="color" />
      }
      <CacheScenario [color]="color" [isMounted]="isMounted()" />
      @if (isMounted()) {
        <PlayerExplorer [color]="color" />
      }
    </ScreenShell>
  `,
})
export class VideoScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
  readonly isMounted = signal(true);
}
