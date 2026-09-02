import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  ElementRef,
  inject,
  signal,
  type DoCheck,
  type OnChanges,
} from '@angular/core';
import {
  anchorHostStyle,
  ImageHost,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
} from '../../primitives';
import {
  IMAGE_INPUTS,
  IMAGE_OUTPUTS,
  ImageBase,
  resolveImageProps,
} from './shared';
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
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ImageHost, SymbioteHostPropsDirective],
  inputs: IMAGE_INPUTS,
  outputs: IMAGE_OUTPUTS,
  template: `
    <symbiote-image
      [symbioteHostProps]="imageProps()"
      (loadStart)="handleLoadStart($event)"
      (load)="handleLoad($event)"
      (loadEnd)="handleLoadEnd($event)"
      (error)="handleError($event)"
      (progress)="handleProgress($event)"
      (partialLoad)="handlePartialLoad($event)"
    />
  `,
})
export class Image extends ImageBase implements OnChanges, DoCheck {
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the inner `symbiote-image` one level down.
  private readonly elementRef = inject(ElementRef);

  // The anchor's class-derived style is written by the renderer's addClass/removeClass and never
  // reaches Angular's input pipeline (a bare `class="x"` never appears in SimpleChanges — see
  // anchorHostStyle's doc comment), so ImageBase's inputsRevision cannot see it. Hence its own
  // signal: a plain field read inside a computed() would be untracked and the bag would go stale
  // the moment a `[class.x]`/`[ngClass]` toggled.
  //
  // ngDoCheck is the right cadence: render3's callHooks flushes a node's pre-order hooks at the
  // next `ɵɵadvance` past it (or in refreshView's post-template flush), i.e. AFTER the declaring
  // template's ɵɵclassProp wrote the class onto this element and BEFORE this component's own view
  // refreshes — the exact window a class poll needs. callHooks also runs under
  // setActiveConsumer(null), so the write registers no dependency on the caller's view (no NG0600).
  // commitClassStyle allocates a fresh style array only when a token actually moved, so signal.set's
  // own Object.is check makes an unchanged poll a no-op that dirties nothing.
  //
  // Known gap, shared with every other component polling this way (Pressable, SafeAreaView,
  // TouchableNativeFeedback): `[ngClass]` applies its tokens from NgClass's OWN ngDoCheck, and a
  // node's hooks flush in registration order with the component's first, so an [ngClass] flip lands
  // one pass after this poll reads it. `class=` and `[class.x]` are written by the declaring
  // template's styling instructions and so are always current here.
  private readonly anchorStyle = signal<unknown>(undefined);

  // ImageBase is undecorated, so the input bump is declared here rather than inherited.
  ngOnChanges(): void {
    this.bumpInputsRevision();
  }

  ngDoCheck(): void {
    this.anchorStyle.set(anchorHostStyle(this.elementRef));
  }

  protected override buildImageProps(): Record<string, unknown> {
    return resolveImageProps({
      ...this.imageInputProps,
      style: [this.anchorStyle(), this.style],
    });
  }
}
