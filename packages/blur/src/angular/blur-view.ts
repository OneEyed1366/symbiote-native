import {
  ChangeDetectionStrategy,
  Component,
  Input,
  type AfterViewInit,
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
} from '@angular/core';
import {
  DescriptorHost,
  NativeViewBase,
  hostNodeOf,
} from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { renderBlurView, warnBlurProps, watchBlurTarget } from '../core';
import type { IBlurViewProps } from '../core';

/** Angular twin of `expo-blur`'s `BlurView`, the projected content paints over the blur */
@Component({
  selector: 'BlurView',
  standalone: true,
  imports: [DescriptorHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-host [node]="node"
      ><ng-content
    /></symbiote-descriptor-host>
  }`,
})
export class BlurView
  extends NativeViewBase
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input() tint?: IBlurViewProps['tint'];
  @Input() intensity?: IBlurViewProps['intensity'];
  @Input() blurReductionFactor?: IBlurViewProps['blurReductionFactor'];
  @Input() experimentalBlurMethod?: IBlurViewProps['experimentalBlurMethod'];
  @Input() blurMethod?: IBlurViewProps['blurMethod'];
  /** Template ref на `BlurTargetView`, его содержимое это фон для размытия */
  @Input() blurTarget?: unknown;

  protected override readonly propNames = [
    'tint',
    'intensity',
    'blurReductionFactor',
    'experimentalBlurMethod',
    'blurMethod',
  ] as const satisfies readonly (keyof BlurView)[];

  private blurTargetId: number | undefined;
  private cancelWatch = (): void => {};
  private isViewReady = false;

  protected override renderView(props: object): IDescriptor {
    return renderBlurView(props, this.blurTargetId);
  }

  // Цель ставится при создании представления соседа, поэтому ждём `ngAfterViewInit`
  ngAfterViewInit(): void {
    this.isViewReady = true;
    this.watchTarget();
    warnBlurProps(
      Object.fromEntries(
        this.propNames.map(name => [name, Reflect.get(this, name)]),
      ),
      this.blurTarget !== undefined,
    );
  }

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if (this.isViewReady && 'blurTarget' in changes) this.watchTarget();
  }

  protected override disposeView(): void {
    this.cancelWatch();
  }

  private watchTarget(): void {
    this.cancelWatch();
    this.cancelWatch = watchBlurTarget(hostNodeOf(this.blurTarget), id => {
      this.blurTargetId = id;
      this.changeDetector.markForCheck();
    });
  }
}
