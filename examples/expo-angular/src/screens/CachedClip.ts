import { Component } from '@angular/core';
import { injectVideoPlayer, VideoView } from '@symbiote-native/video/angular';
import { CACHED_SOURCE } from './video-shared';

@Component({
  selector: 'CachedClip',
  standalone: true,
  imports: [VideoView],
  template: `<VideoView
    testID="video-cached"
    [player]="player()"
    [nativeControls]="true"
    class="vid-small"
  />`,
})
export class CachedClip {
  readonly player = injectVideoPlayer(
    () => CACHED_SOURCE,
    instance => {
      instance.loop = true;
    },
  );
}
