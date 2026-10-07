import { ActionSheetIOS, Alert, Linking, Platform, Share, Vibration } from '@symbiote-native/solid';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';
import { FlexButton } from './canary-parts';
import { SITE } from './canary-shared';

const SHEET_OPTIONS = ['Share', 'Vibrate', 'Cancel'];
const SHEET_CANCEL_INDEX = 2;

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
export function CanaryNativeButtons() {
  return (
    <>
      <view class="row">
        <FlexButton title="Alert" onPress={showAlert} />
        {/* ActionSheetIOS has no Android native module, so it is iOS-only by design */}
        {Platform.OS !== 'android' && <FlexButton title="Action sheet" onPress={showActionSheet} />}
      </view>
      <view class="row">
        <FlexButton title="Share" onPress={share} />
        <FlexButton title="Vibrate" onPress={() => Vibration.vibrate()} />
      </view>
      <ActionButton title="Open solidjs.com" onPress={openSite} color={LINE_COLOR.primitives} />
    </>
  );
}
