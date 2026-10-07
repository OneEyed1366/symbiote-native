import { Component, input } from '@angular/core';
import { injectVideoPlayer, VideoView } from '@symbiote-native/video/angular';

@Component({
  selector: 'RecordedClip',
  standalone: true,
  imports: [VideoView],
  template: `<VideoView
    testID="camera-recorded"
    [player]="player()"
    [nativeControls]="true"
    class="cam-photo"
  />`,
})
export class RecordedClip {
  readonly uri = input.required<string>();

  readonly player = injectVideoPlayer(() => this.uri());
}
