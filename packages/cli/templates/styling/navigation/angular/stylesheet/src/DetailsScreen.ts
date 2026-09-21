import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS, StyleSheet } from '@symbiote-native/angular';

@Component({
  selector: 'DetailsScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [style]="styles.container">
      <text>Details screen</text>
    </view>
  `,
})
export class DetailsScreen {
  readonly styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
}
