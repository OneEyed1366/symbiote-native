import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS, StyleSheet } from '@symbiote-native/angular';

@Component({
  selector: 'symbiote-angular-app',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [style]="styles.container">
      <text>Welcome to SymbioteNative!</text>
      <pressable (press)="increment()">
        <text>Taps: {{ count() }}</text>
      </pressable>
    </view>
  `,
})
export class AppComponent {
  readonly styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
  readonly count = signal(0);

  increment(): void {
    this.count.set(this.count() + 1);
  }
}
