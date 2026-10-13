import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Injector,
  Input,
  ViewChild,
  inject,
  runInInjectionContext,
  type AfterViewInit,
  type OnInit,
} from '@angular/core';
import {
  SymbioteHostPropsDirective,
  type IAngularScrollViewProps,
} from '@symbiote-native/angular';
import { isSymbioteNode } from '@symbiote-native/engine';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type { IAnimatedRef } from '../core/animated-ref';
import type { IAnimatedHostProps } from './animated-host-props';
import { hooks } from './services/hooks';

// One scroll event per frame, so an animation that follows the scroll has a value every frame
const EVERY_FRAME = 1;

const { useAnimatedRef, useObservedScrollOffset } = hooks;

export type IAnimatedScrollViewProps =
  IAnimatedHostProps<IAngularScrollViewProps> & {
    // Receives the scroll position of this view
    scrollViewOffset?: SharedValue<number>;
  };

// The props of the scroll view go in `scrollViewProps`, as the tag takes them one by one and a
// component cannot name them all. A prop that holds a worklet event handler works there as well
@Component({
  selector: 'AnimatedScrollView',
  standalone: true,
  imports: [SymbioteHostPropsDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<scroll-view [symbioteHostProps]="hostProps"
    ><ng-content
  /></scroll-view>`,
})
export class AnimatedScrollView implements OnInit, AfterViewInit {
  @Input() animatedRef?: IAnimatedRef;
  @Input() scrollViewOffset?: SharedValue<number>;
  @Input() scrollViewProps: IAnimatedHostProps<IAngularScrollViewProps> = {};

  @ViewChild(SymbioteHostPropsDirective)
  private view?: SymbioteHostPropsDirective;
  private readonly injector = inject(Injector);
  private ownRef?: IAnimatedRef;

  get hostProps(): Record<string, unknown> {
    return { scrollEventThrottle: EVERY_FRAME, ...this.scrollViewProps };
  }

  // The inputs arrive after the constructor, so the services start here
  ngOnInit(): void {
    runInInjectionContext(this.injector, () => {
      this.ownRef = useAnimatedRef();
      useObservedScrollOffset(
        this.ownRef,
        this.scrollViewOffset,
        this.scrollViewOffset !== undefined,
      );
    });
  }

  ngAfterViewInit(): void {
    const node = this.view?.node;
    if (!isSymbioteNode(node)) return;
    this.ownRef?.(node);
    this.animatedRef?.(node);
  }
}
