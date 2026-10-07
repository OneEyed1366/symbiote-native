import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import type { IStyleProp } from '@symbiote-native/engine';
import { createImageView } from '../../core';
import type { IImageStyle, IImageViewProps } from '../../core';

// One list is the inputs of the component and the props it hands to the native view
const IMAGE_INPUTS = [
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
] as const;

// Types the inputs for the template, the decorators that would do it are replaced by `inputs`
export interface ExpoImage extends Partial<
  Pick<IImageViewProps, (typeof IMAGE_INPUTS)[number]>
> {}

/** Angular twin of `expo-image`'s `Image`, `Image` itself is a primitive tag of the adapter */
@Component({
  selector: 'ExpoImage',
  standalone: true,
  imports: [DescriptorOutlet],
  inputs: [...IMAGE_INPUTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-outlet [node]="node" />
  }`,
})
export class ExpoImage extends NativeViewBase {
  // The `style` input of the base, typed with the image keys such as `tintColor`
  declare style?: IStyleProp<IImageStyle>;

  private readonly view = createImageView(() => this.hostNode());

  // The functions of the view are members of the component, a `@ViewChild` reaches them
  readonly startAnimating = this.view.handle.startAnimating;
  readonly stopAnimating = this.view.handle.stopAnimating;
  readonly lockResourceAsync = this.view.handle.lockResourceAsync;
  readonly unlockResourceAsync = this.view.handle.unlockResourceAsync;
  readonly reloadAsync = this.view.handle.reloadAsync;

  protected override readonly propNames = IMAGE_INPUTS;

  protected override renderView(props: object): IDescriptor | null {
    return this.view.render(props);
  }
}
