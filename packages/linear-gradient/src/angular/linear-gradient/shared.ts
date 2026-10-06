import { Directive, Input } from '@angular/core';
import { NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { renderLinearGradient } from '../../core/linear-gradient';
import type { ILinearGradientProps } from '../../core/linear-gradient';

// Inputs и сборка дескриптора общие, платформы различаются только шаблоном
@Directive()
export abstract class LinearGradientBase extends NativeViewBase {
  @Input({ required: true }) colors!: ILinearGradientProps['colors'];
  @Input() locations?: ILinearGradientProps['locations'];
  @Input() start?: ILinearGradientProps['start'];
  @Input() end?: ILinearGradientProps['end'];
  @Input() dither?: ILinearGradientProps['dither'];

  protected override readonly propNames = [
    'colors',
    'locations',
    'start',
    'end',
    'dither',
  ] as const satisfies readonly (keyof LinearGradientBase)[];

  protected override renderView(props: object): IDescriptor {
    return renderLinearGradient(props);
  }
}
