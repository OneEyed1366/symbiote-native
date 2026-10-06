import { defineComponent } from 'vue';
import { ActionSheetIOS, Alert, Linking, Platform, Share, Vibration } from '@symbiote-native/vue';
import { ACCENT, SHEET_CANCEL_INDEX, SHEET_OPTIONS, SITE } from './canary-shared';

// A rejected promise (no native module, user cancel) is expected here, so it is dropped
const share = (): void => {
  void Share.share({ message: 'Sent from symbiote', url: SITE }).catch(() => {});
};

const showAlert = (): void => {
  Alert.alert('symbiote', 'Native AlertManager reached.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Vibrate', onPress: () => Vibration.vibrate() },
  ]);
};

const showActionSheet = (): void => {
  ActionSheetIOS.showActionSheetWithOptions(
    { options: SHEET_OPTIONS, cancelButtonIndex: SHEET_CANCEL_INDEX },
    (index: number) => {
      if (index === 0) share();
      if (index === 1) Vibration.vibrate();
    },
  );
};

const openSite = (): void => {
  void Linking.openURL(SITE).catch(() => {});
};

// JS -> native imperative modules: each working button proves its module name resolved
export const CanaryNativeButtons = defineComponent({
  name: 'CanaryNativeButtons',
  setup() {
    return () => (
      <>
        <view class="row">
          <view class="flex1">
            <button title="Alert" onPress={showAlert} color={ACCENT} />
          </view>
          {/* ActionSheetIOS has no Android native module, so it is iOS-only by design */}
          {Platform.OS !== 'android' && (
            <view class="flex1">
              <button title="Action sheet" onPress={showActionSheet} color={ACCENT} />
            </view>
          )}
        </view>
        <view class="row">
          <view class="flex1">
            <button title="Share" onPress={share} color={ACCENT} />
          </view>
          <view class="flex1">
            <button title="Vibrate" onPress={() => Vibration.vibrate()} color={ACCENT} />
          </view>
        </view>
        <button title="Open vuejs.org" onPress={openSite} color={ACCENT} />
      </>
    );
  },
});
