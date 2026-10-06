import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorHost, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { renderImageBackground } from '../../core';
import type { IStyleProp } from '@symbiote-native/engine';
import type { IImageBackgroundProps, IImageStyle } from '../../core';

// One list is the inputs of the component and the props it hands to the image
const IMAGE_BACKGROUND_INPUTS = [
  'source',
  'placeholder',
  'contentFit',
  'placeholderContentFit',
  'contentPosition',
  'transition',
  'blurRadius',
  'tintColor',
  'priority',
  'loading',
  'cachePolicy',
  'responsivePolicy',
  'recyclingKey',
  'autoplay',
  'sfEffect',
  'onLoadStart',
  'onLoad',
  'onProgress',
  'onError',
  'onLoadEnd',
  'onDisplay',
  'defaultSource',
  'loadingIndicatorSource',
  'resizeMode',
  'fadeDuration',
  'alt',
  'enableLiveTextInteraction',
  'allowDownscaling',
  'decodeFormat',
  'useAppleWebpCodec',
  'enforceEarlyResizing',
  'preferHighDynamicRange',
  'draggable',
  'imageStyle',
] as const;

export interface ExpoImageBackground extends Partial<
  Pick<IImageBackgroundProps, (typeof IMAGE_BACKGROUND_INPUTS)[number]>
> {}

/** Angular twin of `expo-image`'s `ImageBackground`, the content paints over the image */
@Component({
  selector: 'ExpoImageBackground',
  standalone: true,
  imports: [DescriptorHost],
  inputs: [...IMAGE_BACKGROUND_INPUTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-host [node]="node"
      ><ng-content
    /></symbiote-descriptor-host>
  }`,
})
export class ExpoImageBackground extends NativeViewBase {
  // The `style` input of the base, typed like the one of `ExpoImage`
  declare style?: IStyleProp<IImageStyle>;

  protected override readonly propNames = IMAGE_BACKGROUND_INPUTS;

  protected override renderView(props: object): IDescriptor {
    return renderImageBackground(props);
  }
}
