import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { SymbioteHostPropsDirective, View } from '@symbiote-native/angular';
import { BlurTargetViewBase } from './shared';

/** Angular twin of `expo-blur`'s `BlurTargetView`, a plain View on iOS */
@Component({
  selector: 'BlurTargetView',
  standalone: true,
  imports: [SymbioteHostPropsDirective, View],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<view #host [symbioteHostProps]="hostProps"><ng-content /></view>`,
})
export class BlurTargetView extends BlurTargetViewBase {
  @ViewChild('host', { read: ElementRef, static: true })
  private readonly hostRef!: ElementRef<unknown>;

  get nativeElement(): unknown {
    return this.hostRef.nativeElement;
  }
}
