import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { createVideoView } from '../../core';
import type { IVideoViewProps } from '../../core';

// One list is the inputs of the component and the props it hands to the native view
const VIDEO_VIEW_INPUTS = [
  'player',
  'nativeControls',
  'contentFit',
  'fullscreenOptions',
  'showsTimecodes',
  'requiresLinearPlayback',
  'buttonOptions',
  'surfaceType',
  'contentPosition',
  'onPictureInPictureStart',
  'onPictureInPictureStop',
  'allowsPictureInPicture',
  'startsPictureInPictureAutomatically',
  'allowsVideoFrameAnalysis',
  'onFullscreenEnter',
  'onFullscreenExit',
  'onFirstFrameRender',
  'useExoShutter',
] as const;

// Types the inputs for the template, the decorators that would do it are replaced by `inputs`
export interface VideoView extends Partial<
  Pick<IVideoViewProps, (typeof VIDEO_VIEW_INPUTS)[number]>
> {}

/** Angular twin of `expo-video`'s `VideoView` */
@Component({
  selector: 'VideoView',
  standalone: true,
  imports: [DescriptorOutlet],
  inputs: [...VIDEO_VIEW_INPUTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-outlet [node]="node" />
  }`,
})
export class VideoView extends NativeViewBase {
  private readonly view = createVideoView(() => this.hostNode());

  // The functions of the view are members of the component, a `@ViewChild` reaches them
  readonly enterFullscreen = this.view.handle.enterFullscreen;
  readonly exitFullscreen = this.view.handle.exitFullscreen;
  readonly startPictureInPicture = this.view.handle.startPictureInPicture;
  readonly stopPictureInPicture = this.view.handle.stopPictureInPicture;

  protected override readonly propNames = VIDEO_VIEW_INPUTS;

  protected override renderView(props: object): IDescriptor | null {
    return this.view.render(props);
  }
}
