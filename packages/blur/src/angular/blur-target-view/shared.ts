import { Directive, Input } from '@angular/core';
import { NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { renderBlurTargetView } from '../../core';

// Платформы различаются только тегом в шаблоне, остальное общее
@Directive()
export abstract class BlurTargetViewBase extends NativeViewBase {
  /** Нужен свойству `blurTarget` у `BlurView`, чтобы найти host-узел */
  abstract readonly nativeElement: unknown;

  protected readonly propNames =
    [] as const satisfies readonly (keyof BlurTargetViewBase)[];

  protected override renderView(props: object): IDescriptor {
    return renderBlurTargetView(props);
  }

  get hostProps(): Record<string, unknown> {
    return this.descriptor?.props ?? {};
  }
}
