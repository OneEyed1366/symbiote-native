import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import stylesModule from './App.module.css';

@Component({
  selector: 'symbiote-angular-app',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [class]="containerClass">
      <text>Welcome to SymbioteNative!</text>
      <pressable (press)="increment()">
        <text>Taps: {{ count() }}</text>
      </pressable>
    </view>
  `,
})
export class AppComponent {
  readonly containerClass = stylesModule.container;
  readonly count = signal(0);

  increment(): void {
    this.count.set(this.count() + 1);
  }
}
