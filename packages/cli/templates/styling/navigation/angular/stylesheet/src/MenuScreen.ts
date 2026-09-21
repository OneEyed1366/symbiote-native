import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS, StyleSheet } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';

@Component({
  selector: 'MenuScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [style]="styles.container">
      <text>Welcome to SymbioteNative!</text>
      <pressable (press)="navigation.push('Details')">
        <text>Go to Details</text>
      </pressable>
    </view>
  `,
})
export class MenuScreen {
  readonly styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
  readonly navigation = injectStackNavigation();
}
