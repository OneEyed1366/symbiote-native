import { Component, computed, input } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectVideoPlayer, VideoView } from '@symbiote-native/video/angular';
import { ResultRow } from '../components/ResultRow';
import { injectPlayerEventOrNull } from './video-parts';

// Only the active item has a source, the others unload, which is what a recycled feed does
@Component({
  selector: 'FeedItem',
  standalone: true,
  imports: [ResultRow, SYMBIOTE_ELEMENTS, VideoView],
  template: `
    <view class="vid-feed-item">
      <VideoView
        [testID]="viewId()"
        [player]="player()"
        [nativeControls]="false"
        contentFit="cover"
        class="vid-small"
      />
      <ResultRow [testID]="rowId()" [label]="rowLabel()" [value]="rowValue()" />
    </view>
  `,
})
export class FeedItem {
  readonly uri = input.required<string>();
  readonly isActive = input.required<boolean>();
  readonly index = input.required<number>();

  readonly player = injectVideoPlayer(
    () => (this.isActive() ? this.uri() : null),
    instance => {
      instance.loop = true;
      instance.muted = true;
      instance.play();
    },
  );
  private readonly statusEvent = injectPlayerEventOrNull(
    this.player,
    'statusChange',
  );

  readonly viewId = computed(() => `video-reel-${String(this.index())}`);
  readonly rowId = computed(() => `video-reel-status-${String(this.index())}`);
  readonly rowLabel = computed(() => `Clip ${String(this.index() + 1)}`);
  readonly rowValue = computed(() =>
    this.isActive()
      ? (this.statusEvent()?.status ?? this.player().status)
      : 'unloaded',
  );
}
