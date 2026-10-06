import {
  ChangeDetectionStrategy,
  Component,
  Input,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { renderSymbolView, watchSymbolFont } from '../core';
import type { ISymbolViewProps } from '../core';

/** Angular twin of `expo-symbols`' `SymbolView`, projected content is the fallback without a symbol */
@Component({
  selector: 'SymbolView',
  standalone: true,
  imports: [DescriptorOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
      <symbiote-descriptor-outlet [node]="node" />
    } @else {
      <ng-content />
    }`,
})
export class SymbolView extends NativeViewBase implements OnInit, OnDestroy {
  @Input({ required: true }) name!: ISymbolViewProps['name'];
  @Input() type?: ISymbolViewProps['type'];
  @Input() scale?: ISymbolViewProps['scale'];
  @Input() weight?: ISymbolViewProps['weight'];
  @Input() colors?: ISymbolViewProps['colors'];
  @Input() size?: ISymbolViewProps['size'];
  @Input() tintColor?: ISymbolViewProps['tintColor'];
  @Input() resizeMode?: ISymbolViewProps['resizeMode'];
  @Input() animationSpec?: ISymbolViewProps['animationSpec'];

  protected override readonly propNames = [
    'name',
    'type',
    'scale',
    'weight',
    'colors',
    'size',
    'tintColor',
    'resizeMode',
    'animationSpec',
  ] as const satisfies readonly (keyof SymbolView)[];

  private isFontLoaded = false;
  private cancelWatch = (): void => {};

  protected override renderView(props: object): IDescriptor | null {
    return renderSymbolView(props, this.isFontLoaded);
  }

  // Шрифт грузится один раз при создании, как в upstream
  ngOnInit(): void {
    this.cancelWatch = watchSymbolFont(
      Object.fromEntries(
        this.propNames.map(propName => [propName, Reflect.get(this, propName)]),
      ),
      isLoaded => {
        this.isFontLoaded = isLoaded;
        this.changeDetector.markForCheck();
      },
    );
  }

  protected override disposeView(): void {
    this.cancelWatch();
  }
}
