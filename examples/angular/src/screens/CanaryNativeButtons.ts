import { Component } from '@angular/core';
import {
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
  Share,
  SYMBIOTE_ELEMENTS,
  Vibration,
} from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import {
  ACCENT,
  SHEET_CANCEL_INDEX,
  SHEET_OPTIONS,
  SITE,
} from './canary-shared';

// JS -> native imperative modules: each working button proves its module name resolved
@Component({
  selector: 'CanaryNativeButtons',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="row">
      <view class="flex-1">
        <ActionButton
          testID="angular-alert-btn"
          title="Alert"
          (press)="onAlert()"
          [color]="accent"
        />
      </view>
      <!-- ActionSheetIOS has no Android native module, so it is iOS-only by design -->
      @if (hasActionSheet) {
        <view class="flex-1">
          <ActionButton
            testID="angular-action-sheet-btn"
            title="Action sheet"
            (press)="onActionSheet()"
            [color]="accent"
          />
        </view>
      }
    </view>
    <view class="row">
      <view class="flex-1">
        <ActionButton
          testID="angular-share-btn"
          title="Share"
          (press)="onShare()"
          [color]="accent"
        />
      </view>
      <view class="flex-1">
        <ActionButton
          testID="angular-vibrate-btn"
          title="Vibrate"
          (press)="onVibrate()"
          [color]="accent"
        />
      </view>
    </view>
    <ActionButton
      testID="angular-open-url-btn"
      title="Open angular.dev"
      (press)="onOpenUrl()"
      [color]="accent"
    />
  `,
})
export class CanaryNativeButtons {
  readonly accent = ACCENT;
  readonly hasActionSheet = Platform.OS !== 'android';

  // A rejected promise (no native module, user cancel) is expected here, so it is dropped
  onShare(): void {
    void Share.share({
      message: 'Sent from symbiote Angular',
      url: SITE,
    }).catch(() => undefined);
  }

  onAlert(): void {
    Alert.alert('symbiote', 'Angular reached the native AlertManager.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Vibrate', onPress: () => Vibration.vibrate() },
    ]);
  }

  onActionSheet(): void {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: SHEET_OPTIONS, cancelButtonIndex: SHEET_CANCEL_INDEX },
      (index: number) => {
        if (index === 0) this.onShare();
        if (index === 1) Vibration.vibrate();
      },
    );
  }

  onVibrate(): void {
    Vibration.vibrate();
  }

  onOpenUrl(): void {
    void Linking.openURL(SITE).catch(() => undefined);
  }
}
