// Angular half of StatusBar, the props stack, statics and Android bar-height constant live in
// @symbiote-native/engine. It renders nothing, keeps one stack entry through `ngOnChanges` and
// releases it in `ngOnDestroy`

import {
  Component,
  Input,
  type OnChanges,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import {
  createStatusBarEntry,
  statusBarImperative,
  statusBarCurrentHeight,
  type IColorValue,
  type IStatusBarAnimation,
  type IStatusBarProps,
  type IStatusBarStyle,
} from '@symbiote-native/engine';

export type { IStatusBarProps, IStatusBarStyle } from '@symbiote-native/engine';

@Component({
  selector: 'StatusBar',
  standalone: true,
  template: '',
})
class StatusBarComponent implements OnInit, OnChanges, OnDestroy {
  @Input() barStyle?: IStatusBarStyle;
  @Input() hidden?: boolean;
  @Input() animated?: boolean;
  @Input() showHideTransition?: IStatusBarAnimation;
  @Input() networkActivityIndicatorVisible?: boolean;
  @Input() backgroundColor?: IColorValue;
  @Input() translucent?: boolean;

  private readonly entry = createStatusBarEntry();

  // `ngOnChanges` never runs without bound inputs, the bar still takes its place in the stack
  ngOnInit(): void {
    this.entry.apply(this.buildProps());
  }

  ngOnChanges(): void {
    this.entry.apply(this.buildProps());
  }

  // Popping restores what the stack held below this entry
  ngOnDestroy(): void {
    this.entry.release();
  }

  private buildProps(): IStatusBarProps {
    return {
      barStyle: this.barStyle,
      hidden: this.hidden,
      animated: this.animated,
      showHideTransition: this.showHideTransition,
      networkActivityIndicatorVisible: this.networkActivityIndicatorVisible,
      backgroundColor: this.backgroundColor,
      translucent: this.translucent,
    };
  }
}

const StatusBarWithStatics = Object.assign(
  StatusBarComponent,
  statusBarImperative,
);

Object.defineProperty(StatusBarWithStatics, 'currentHeight', {
  get: statusBarCurrentHeight,
  enumerable: true,
});

export const StatusBar: typeof StatusBarWithStatics & {
  readonly currentHeight?: number;
} = StatusBarWithStatics;
