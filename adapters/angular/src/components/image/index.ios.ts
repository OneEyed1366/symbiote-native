import { CUSTOM_ELEMENTS_SCHEMA, Component, ElementRef, inject } from '@angular/core';
import { anchorHostStyle, ImageHost, SymbioteHostPropsDirective } from '../../primitives';
import { IMAGE_INPUTS, IMAGE_OUTPUTS, ImageBase, resolveImageProps } from './shared';
export { setImageSourceResolver } from './shared';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from './shared';

@Component({
  selector: 'Image',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ImageHost, SymbioteHostPropsDirective],
  inputs: IMAGE_INPUTS,
  outputs: IMAGE_OUTPUTS,
  template: `
    <symbiote-image
      [symbioteHostProps]="imageProps"
      (accessibilityAction)="handleAccessibilityAction($event)"
      (accessibilityTap)="handleAccessibilityTap($event)"
      (magicTap)="handleMagicTap($event)"
      (accessibilityEscape)="handleAccessibilityEscape($event)"
      (loadStart)="handleLoadStart($event)"
      (load)="handleLoad($event)"
      (loadEnd)="handleLoadEnd($event)"
      (error)="handleError($event)"
      (progress)="handleProgress($event)"
      (partialLoad)="handlePartialLoad($event)"
    />
  `,
})
export class Image extends ImageBase {
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the inner `symbiote-image` one level down.
  private readonly elementRef = inject(ElementRef);

  override get imageProps(): Record<string, unknown> {
    return resolveImageProps({
      ...this.imageInputProps,
      style: [anchorHostStyle(this.elementRef), this.style],
    });
  }
}
