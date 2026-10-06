import { createSignal } from 'solid-js';
import { Platform, StatusBar } from '@symbiote-native/solid';
import { FlexButton } from './canary-parts';

const BAR_RED = '#ff0000';
const BAR_DEFAULT = '#101a2c';

// Android-only window flags. PASS: the strip changes and the app stays rendered, FAIL: it blanks
function AndroidWindowFlags() {
  const [isRed, setIsRed] = createSignal(false);
  const [isTranslucent, setIsTranslucent] = createSignal(false);
  const toggleRed = () => {
    const next = !isRed();
    setIsRed(next);
    StatusBar.setBackgroundColor(next ? BAR_RED : BAR_DEFAULT, true);
  };
  const toggleTranslucent = () => {
    const next = !isTranslucent();
    setIsTranslucent(next);
    StatusBar.setTranslucent(next);
  };
  return (
    <view class="row">
      <FlexButton title={isRed() ? 'BG default' : 'BG red'} onPress={toggleRed} />
      <FlexButton title={isTranslucent() ? 'Opaque' : 'Translucent'} onPress={toggleTranslucent} />
    </view>
  );
}

// JS -> native: StatusBar renders nothing and drives the top strip from these props
export function CanaryStatusBar() {
  const [isHidden, setIsHidden] = createSignal(false);
  const [isDark, setIsDark] = createSignal(false);
  return (
    <>
      <StatusBar barStyle={isDark() ? 'dark-content' : 'light-content'} hidden={isHidden()} animated />
      <view class="row">
        <FlexButton
          title={isHidden() ? 'Show status bar' : 'Hide status bar'}
          onPress={() => setIsHidden(value => !value)}
        />
        <FlexButton title={isDark() ? 'Light text' : 'Dark text'} onPress={() => setIsDark(value => !value)} />
      </view>
      {/* Platform.OS never changes, so a plain && is right, Show is for reactive conditions */}
      {Platform.OS === 'android' && <AndroidWindowFlags />}
    </>
  );
}
