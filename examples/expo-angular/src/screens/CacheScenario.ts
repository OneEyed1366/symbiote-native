import { Component, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  clearVideoCacheAsync,
  getCurrentVideoCacheSize,
  setVideoCacheSizeAsync,
} from '@symbiote-native/video/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { CachedClip } from './CachedClip';
import { BYTES_PER_MB, CACHE_LIMIT_BYTES, errorLine } from './video-shared';

@Component({
  selector: 'CacheScenario',
  standalone: true,
  imports: [ActionButton, CachedClip, ResultRow, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <Scenario
      testID="video-cache-scenario"
      title="Replay a video without downloading it again"
      why="With useCaching a source is stored on disk while it plays, so a repeat view works on a poor connection and costs no traffic. The cache has a size limit the app can set."
      [steps]="steps"
      expect="The size grows after playing the clip. With players mounted the limit and clear calls report an error, with players off they succeed and the size drops to 0."
    >
      @if (isMounted()) {
        <CachedClip />
      }
      <ResultRow testID="video-cache-line" label="Cache" [value]="line()" />
      <view class="button-row">
        <ActionButton
          testID="video-cache-size"
          title="Read size"
          [color]="color()"
          (press)="readSize()"
        />
        <ActionButton
          testID="video-cache-limit"
          title="Set limit 100 MB"
          [color]="color()"
          (press)="setLimit()"
        />
        <ActionButton
          testID="video-cache-clear"
          title="Clear cache"
          [color]="color()"
          (press)="clearAll()"
        />
      </view>
    </Scenario>
  `,
})
export class CacheScenario {
  readonly color = input.required<string>();
  readonly isMounted = input.required<boolean>();

  readonly steps = [
    'With the players mounted, play the small clip to the end, then Read size',
    'Turn the players off at the top of the screen',
    'Press Set limit 100 MB, then Clear cache, then Read size',
  ];
  readonly line = signal('press Read size');

  private async run(
    name: string,
    action: () => Promise<void> | void,
  ): Promise<void> {
    try {
      await action();
      this.line.set(
        `${name} ok, cache is ${(getCurrentVideoCacheSize() / BYTES_PER_MB).toFixed(1)} MB`,
      );
    } catch (error) {
      this.line.set(`${name} failed: ${errorLine(error)}`);
    }
  }

  readSize(): Promise<void> {
    return this.run('getCurrentVideoCacheSize', () => undefined);
  }

  setLimit(): Promise<void> {
    return this.run('setVideoCacheSizeAsync', () =>
      setVideoCacheSizeAsync(CACHE_LIMIT_BYTES),
    );
  }

  clearAll(): Promise<void> {
    return this.run('clearVideoCacheAsync', clearVideoCacheAsync);
  }
}
