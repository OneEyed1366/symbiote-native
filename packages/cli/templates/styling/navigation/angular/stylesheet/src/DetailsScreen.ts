import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS, StyleSheet } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';

@Component({
  selector: 'DetailsScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view [style]="styles.screen">
      <view [style]="styles.detailsCard">
        <text [style]="styles.detailsTitle">You made it!</text>
        <text [style]="styles.detailsBody">This screen was pushed by the Stack navigator — proof navigation actually works.</text>
      </view>
      <pressable [style]="styles.buttonSecondary" (press)="navigation.pop()">
        <text [style]="styles.buttonSecondaryText">Go back</text>
      </pressable>
    </safe-area-view>
  `,
})
export class DetailsScreen {
  readonly styles = StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: '#0b1622',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      paddingVertical: 24,
      paddingHorizontal: 32,
    },
    detailsCard: {
      alignItems: 'center',
      gap: 10,
      padding: 24,
      borderRadius: 16,
      backgroundColor: '#13243a',
    },
    detailsTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
    detailsBody: { color: '#cbd5e1', fontSize: 14, textAlign: 'center' },
    buttonSecondary: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 22,
      borderWidth: 1.5,
      borderColor: '#41506a',
    },
    buttonSecondaryText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  });
  readonly navigation = injectStackNavigation();
}
