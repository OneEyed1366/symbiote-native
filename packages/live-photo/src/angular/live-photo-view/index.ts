import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { createLivePhotoViewHandle, renderLivePhotoView } from '../../core';
import type { ILivePhotoPlaybackStyle, ILivePhotoViewProps } from '../../core';

/** Angular twin of `expo-live-photo`'s `LivePhotoView`, iOS only */
@Component({
  selector: 'LivePhotoView',
  standalone: true,
  imports: [DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-outlet [node]="node" />
  }`,
})
export class LivePhotoView extends NativeViewBase {
  @Input() source?: ILivePhotoViewProps['source'];
  @Input() isMuted?: ILivePhotoViewProps['isMuted'];
  @Input() contentFit?: ILivePhotoViewProps['contentFit'];
  @Input()
  useDefaultGestureRecognizer?: ILivePhotoViewProps['useDefaultGestureRecognizer'];
  @Input() onPlaybackStart?: ILivePhotoViewProps['onPlaybackStart'];
  @Input() onPlaybackStop?: ILivePhotoViewProps['onPlaybackStop'];
  @Input() onLoadStart?: ILivePhotoViewProps['onLoadStart'];
  @Input() onPreviewPhotoLoad?: ILivePhotoViewProps['onPreviewPhotoLoad'];
  @Input() onLoadComplete?: ILivePhotoViewProps['onLoadComplete'];
  @Input() onLoadError?: ILivePhotoViewProps['onLoadError'];

  private readonly handle = createLivePhotoViewHandle(() => this.hostNode());

  protected override readonly propNames = [
    'source',
    'isMuted',
    'contentFit',
    'useDefaultGestureRecognizer',
    'onPlaybackStart',
    'onPlaybackStop',
    'onLoadStart',
    'onPreviewPhotoLoad',
    'onLoadComplete',
    'onLoadError',
  ] as const satisfies readonly (keyof LivePhotoView)[];

  protected override renderView(props: object): IDescriptor | null {
    return renderLivePhotoView(props);
  }

  startPlayback(playbackStyle?: ILivePhotoPlaybackStyle): void {
    this.handle.startPlayback(playbackStyle);
  }

  stopPlayback(): void {
    this.handle.stopPlayback();
  }
}
