import { createSignal } from 'solid-js';
import { StyleSheet } from '@symbiote-native/solid';

export default function App() {
  const [count, setCount] = createSignal(0);

  return (
    <safe-area-view style={styles.screen}>
      <view style={styles.brandRow}>
        <image
          style={[styles.brandLogo, styles.brandLogoReact]}
          resizeMode="contain"
          source={require('./assets/react-native-logo.png')}
        />
        <image style={styles.plusIcon} resizeMode="contain" source={require('./assets/plus-icon.png')} />
        <image
          style={[styles.brandLogo, styles.brandLogoSolid]}
          resizeMode="contain"
          source={require('./assets/solid-logo.png')}
        />
      </view>
      <text style={styles.title}>Welcome to SymbioteNative!</text>
      <text style={styles.subtitle}>Framework-agnostic React Native, driven by Solid.</text>

      <view style={styles.counterCard}>
        <text style={styles.counterLabel}>TAPS</text>
        <text style={styles.counterValue}>{count()}</text>
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  brandLogo: { height: 64 },
  brandLogoReact: { width: 70 },
  brandLogoSolid: { width: 66 },
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
  counterValue: { color: '#2c4f7c', fontSize: 32, fontWeight: 'bold' },
  buttonPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    backgroundColor: '#2c4f7c',
  },
  buttonPrimaryText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
});
