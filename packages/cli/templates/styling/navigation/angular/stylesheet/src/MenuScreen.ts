import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS, StyleSheet } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';

@Component({
  selector: 'MenuScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view [style]="styles.screen">
      <view [style]="styles.brandRow">
        <image [styleProp]="[styles.brandLogo, styles.brandLogoReact]" resizeMode="contain" [source]="reactNativeLogo"></image>
        <image [style]="styles.plusIcon" resizeMode="contain" [source]="plusIcon"></image>
        <image [styleProp]="[styles.brandLogo, styles.brandLogoAngular]" resizeMode="contain" [source]="angularLogo"></image>
      </view>

      <text [style]="styles.title">Welcome to SymbioteNative!</text>
      <text [style]="styles.subtitle">Framework-agnostic React Native, driven by Angular.</text>

      <view [style]="styles.counterCard">
        <text [style]="styles.counterLabel">TAPS</text>
        <text [style]="styles.counterValue">{{ count() }}</text>
      </view>

      <view [style]="styles.buttonRow">
        <pressable [style]="styles.buttonPrimary" (press)="count.update(v => v + 1)">
          <text [style]="styles.buttonPrimaryText">Tap me</text>
        </pressable>
        <pressable [style]="styles.buttonSecondary" (press)="navigation.push('Details')">
          <text [style]="styles.buttonSecondaryText">Go to Details</text>
        </pressable>
      </view>
    </safe-area-view>
  `,
})
export class MenuScreen {
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
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 28 },
    brandLogo: { height: 64 },
    brandLogoReact: { width: 70 },
    brandLogoAngular: { width: 61 },
    plusIcon: { width: 48, height: 48 },
    title: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
    subtitle: { color: '#cbd5e1', fontSize: 14, textAlign: 'center' },
    counterCard: {
      alignItems: 'center',
      gap: 4,
      paddingVertical: 20,
      paddingHorizontal: 28,
      borderRadius: 16,
      backgroundColor: '#13243a',
    },
    counterLabel: { color: '#41506a', fontSize: 12, letterSpacing: 1 },
    counterValue: { color: '#dd0031', fontSize: 32, fontWeight: 'bold' },
    buttonRow: { flexDirection: 'row', gap: 12 },
    buttonPrimary: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 22,
      backgroundColor: '#dd0031',
    },
    buttonSecondary: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 22,
      borderWidth: 1.5,
      borderColor: '#41506a',
    },
    buttonPrimaryText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
    buttonSecondaryText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  });
  readonly navigation = injectStackNavigation();
  readonly count = signal(0);
  readonly reactNativeLogo = require('./assets/react-native-logo.png');
  readonly plusIcon = require('./assets/plus-icon.png');
  readonly angularLogo = require('./assets/angular-logo.png');
}
