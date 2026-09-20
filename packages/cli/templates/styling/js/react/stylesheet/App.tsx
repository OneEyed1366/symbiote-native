import { useState } from 'react';
import { StyleSheet } from '@symbiote-native/react';

export default function App() {
  const [count, setCount] = useState<number>(0);

  return (
    <safe-area-view style={styles.screen}>
      <image
        style={styles.brandLogo}
        resizeMode="contain"
        source={require('./assets/react-native-logo.png')}
      />
      <text style={styles.title}>Welcome to SymbioteNative!</text>
      <text style={styles.subtitle}>Framework-agnostic React Native, driven by React.</text>

      <view style={styles.counterCard}>
        <text style={styles.counterLabel}>TAPS</text>
        <text style={styles.counterValue}>{count}</text>
      </view>

      <pressable style={styles.buttonPrimary} onPress={() => setCount((value) => value + 1)}>
        <text style={styles.buttonPrimaryText}>Tap me</text>
      </pressable>
    </safe-area-view>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1622',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 24,
    paddingHorizontal: 32,
  },
  brandLogo: { height: 64, aspectRatio: 1.0977 },
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
  counterValue: { color: '#61dafb', fontSize: 32, fontWeight: 'bold' },
  buttonPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    backgroundColor: '#61dafb',
  },
  buttonPrimaryText: { color: '#0b1622', fontSize: 15, fontWeight: 'bold' },
});
