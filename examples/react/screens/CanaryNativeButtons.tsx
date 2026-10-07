import {
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
  Share,
  Vibration,
} from '@symbiote-native/react';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';
import { FlexButton } from './canary-parts';

const SITE = 'https://reactnative.dev';
const SHEET_OPTIONS = ['Share', 'Vibrate', 'Cancel'];
const SHEET_CANCEL_INDEX = 2;

// A rejected promise (no native module, user cancel) is expected here, so it is dropped
const share = () => {
  Share.share({ message: 'Sent from symbiote', url: SITE }).catch(() => {});
};

const showAlert = () => {
  Alert.alert('symbiote', 'Native AlertManager reached.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Vibrate', onPress: () => Vibration.vibrate() },
  ]);
};

const showActionSheet = () => {
  ActionSheetIOS.showActionSheetWithOptions(
    { options: SHEET_OPTIONS, cancelButtonIndex: SHEET_CANCEL_INDEX },
    (index: number) => {
      if (index === 0) share();
      if (index === 1) Vibration.vibrate();
    },
  );
};

const openSite = () => {
  Linking.openURL(SITE).catch(() => {});
};

// JS -> native imperative modules: each working button proves its module name resolved
export function CanaryNativeButtons() {
  return (
    <>
      <view className="row">
        <FlexButton title="Alert" onPress={showAlert} />
        {/* ActionSheetIOS has no Android native module, so it is iOS-only by design */}
        {Platform.OS !== 'android' && <FlexButton title="Action sheet" onPress={showActionSheet} />}
      </view>
      <view className="row">
        <FlexButton title="Share" onPress={share} />
        <FlexButton title="Vibrate" onPress={() => Vibration.vibrate()} />
      </view>
      <ActionButton title="Open reactnative.dev" onPress={openSite} color={LINE_COLOR.primitives} />
    </>
  );
}
