import { Directive, ElementRef, inject, Input } from '@angular/core';
import { resolveAccessibilityProps } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import { AccessibilityInputsBase } from './accessibility-inputs';
import { anchorStyleProp } from './primitives/shared';

// Shared shell of a component that paints one Expo native view: the common inputs, the anchor
// host `class="..."` resolves onto, and a descriptor that recomputes on every OnPush check
@Directive()
export abstract class NativeViewBase extends AccessibilityInputsBase {
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() onLayout?: (event: ISymbioteEvent) => void;
  @Input() onAccessibilityTap?: (event: ISymbioteEvent) => void;
  @Input() onMagicTap?: (event: ISymbioteEvent) => void;
  @Input() onAccessibilityEscape?: (event: ISymbioteEvent) => void;

  // This component's own `ElementRef`, the anchor a `class="..."` at the use site lands on
  private readonly elementRef = inject(ElementRef);

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
