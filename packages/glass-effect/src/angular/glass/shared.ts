import { Directive, Input } from '@angular/core';
import { NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { renderGlassContainer, renderGlassView } from '../../core';
import type { IGlassContainerProps, IGlassViewProps } from '../../core';

// Inputs и сборка дескриптора общие, платформы различаются только шаблоном
@Directive()
export abstract class GlassViewBase extends NativeViewBase {
  @Input() glassEffectStyle?: IGlassViewProps['glassEffectStyle'];
  @Input() tintColor?: IGlassViewProps['tintColor'];
  @Input() isInteractive?: IGlassViewProps['isInteractive'];
  @Input() colorScheme?: IGlassViewProps['colorScheme'];

  protected override readonly propNames = [
    'glassEffectStyle',
    'tintColor',
    'isInteractive',
    'colorScheme',
  ] as const satisfies readonly (keyof GlassViewBase)[];

  protected override renderView(props: object): IDescriptor {
    return renderGlassView(props);
  }
}

@Directive()
export abstract class GlassContainerBase extends NativeViewBase {
  @Input() spacing?: IGlassContainerProps['spacing'];

  protected override readonly propNames = [
    'spacing',
  ] as const satisfies readonly (keyof GlassContainerBase)[];

  protected override renderView(props: object): IDescriptor {
    return renderGlassContainer(props);
  }
}
