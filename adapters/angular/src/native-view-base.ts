import {
  ChangeDetectorRef,
  Directive,
  ElementRef,
  inject,
  Input,
  ViewChild,
} from '@angular/core';
import type { OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { resolveAccessibilityProps } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  ISymbioteNode,
  IViewStyle,
} from '@symbiote-native/engine';
import { AccessibilityInputsBase } from './accessibility-inputs';
import { DescriptorOutlet } from './descriptor-to-angular';
import { hostNodeOf } from './host-instance';
import { anchorStyleProp } from './primitives/shared';

// Shared shell of a component that paints one Expo native view: the common inputs, the anchor
// host `class="..."` resolves onto, and a descriptor that recomputes on every OnPush check
@Directive()
export abstract class NativeViewBase
  extends AccessibilityInputsBase
  implements OnChanges, OnDestroy
{
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() onLayout?: (event: ISymbioteEvent) => void;
  @Input() onAccessibilityTap?: (event: ISymbioteEvent) => void;
  @Input() onMagicTap?: (event: ISymbioteEvent) => void;
  @Input() onAccessibilityEscape?: (event: ISymbioteEvent) => void;

  // This component's own `ElementRef`, the anchor a `class="..."` at the use site lands on
  private readonly elementRef = inject(ElementRef);
  protected readonly changeDetector = inject(ChangeDetectorRef);

  @ViewChild(DescriptorOutlet) private readonly nativeOutlet?: DescriptorOutlet;

  // The committed host node of the native view, for a component that calls its view functions
  protected hostNode(): ISymbioteNode | null {
    return hostNodeOf(this.nativeOutlet?.rootNode);
  }

  // Hook for a component that holds more than its native node, runs once when it is destroyed
  protected disposeView(): void {}

  // A `[style]` binding reaches the `style` input without dirtying an OnPush view, a plain
  // `[prop]` does. A subclass with its own `ngOnChanges` calls this one first
  ngOnChanges(changes: SimpleChanges): void {
    if ('style' in changes) this.changeDetector.markForCheck();
  }

  ngOnDestroy(): void {
    this.disposeView();
  }

  // Names of the component's own inputs that go to the native view, read off `this`
  protected abstract readonly propNames: readonly string[];

  // The core render fn, `null` when the view has nothing to paint on this platform
  protected abstract renderView(props: object): IDescriptor | null;

  get descriptor(): IDescriptor | null {
    return this.renderView(
      resolveAccessibilityProps({
        ...this.accessibilityInputProps(),
        ...Object.fromEntries(
          this.propNames.map(name => [name, Reflect.get(this, name)]),
        ),
        // Ambient class style first, so an explicit `style` input wins
        style: [anchorStyleProp<IViewStyle>(this.elementRef), this.style],
        testID: this.testID,
        nativeID: this.nativeID,
        onLayout: this.onLayout,
        onAccessibilityTap: this.onAccessibilityTap,
        onMagicTap: this.onMagicTap,
        onAccessibilityEscape: this.onAccessibilityEscape,
      }),
    );
  }
}
