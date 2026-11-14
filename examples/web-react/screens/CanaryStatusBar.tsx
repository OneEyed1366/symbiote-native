import { useState } from 'react';
import { Platform, StatusBar } from '@symbiote-native/react';
import { FlexButton } from './canary-parts';

const BAR_RED = '#ff0000';
const BAR_DEFAULT = '#101a2c';

// Android-only window flags. PASS: the strip changes and the app stays rendered, FAIL: it blanks
function AndroidWindowFlags() {
  const [isRed, setIsRed] = useState(false);
  const [isTranslucent, setIsTranslucent] = useState(false);
  const toggleRed = () => {
    const next = !isRed;
    setIsRed(next);
    StatusBar.setBackgroundColor(next ? BAR_RED : BAR_DEFAULT, true);
  };
  const toggleTranslucent = () => {
    const next = !isTranslucent;
    setIsTranslucent(next);
    StatusBar.setTranslucent(next);
  };
  return (
    <view className="row">
      <FlexButton title={isRed ? 'BG default' : 'BG red'} onPress={toggleRed} />
      <FlexButton title={isTranslucent ? 'Opaque' : 'Translucent'} onPress={toggleTranslucent} />
    </view>
  );
}

// JS -> native: StatusBar renders nothing and drives the top strip from these props
export function CanaryStatusBar() {
  const [isHidden, setIsHidden] = useState(false);
  const [isDark, setIsDark] = useState(false);
  return (
    <>
      <StatusBar barStyle={isDark ? 'dark-content' : 'light-content'} hidden={isHidden} animated />
      <view className="row">
        <FlexButton
          title={isHidden ? 'Show status bar' : 'Hide status bar'}
          onPress={() => setIsHidden(value => !value)}
        />
        <FlexButton title={isDark ? 'Light text' : 'Dark text'} onPress={() => setIsDark(value => !value)} />
      </view>
      {Platform.OS === 'android' && <AndroidWindowFlags />}
    </>
  );
}
