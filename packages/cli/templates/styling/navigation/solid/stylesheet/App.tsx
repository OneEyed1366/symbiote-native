import { Stack, useStackNavigation } from '@symbiote-native/navigation/solid';
import { createSignal } from 'solid-js';
import { StyleSheet } from '@symbiote-native/solid';

function MenuScreen() {
  const navigation = useStackNavigation();
  const [count, setCount] = createSignal<number>(0);

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

      <view style={styles.buttonRow}>
        <pressable style={styles.buttonPrimary} onPress={() => setCount(count() + 1)}>
          <text style={styles.buttonPrimaryText}>Tap me</text>
        </pressable>
        <pressable style={styles.buttonSecondary} onPress={() => navigation().push('Details')}>
          <text style={styles.buttonSecondaryText}>Go to Details</text>
        </pressable>
      </view>
    </safe-area-view>
  );
}

function DetailsScreen() {
  const navigation = useStackNavigation();

  return (
    <safe-area-view style={styles.screen}>
      <view style={styles.detailsCard}>
        <text style={styles.detailsTitle}>You made it!</text>
        <text style={styles.detailsBody}>
          This screen was pushed by the Stack navigator — proof navigation actually works.
        </text>
      </view>
      <pressable style={styles.buttonSecondary} onPress={() => navigation().pop()}>
        <text style={styles.buttonSecondaryText}>Go back</text>
      </pressable>
    </safe-area-view>
  );
}

const SCREEN_OPTIONS = {
  headerTranslucent: true,
  headerTintColor: '#ffffff',
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark' as const,
};

export default function App() {
  return (
    <Stack initialRouteName="Menu">
      <Stack.Screen
        name="Menu"
        component={MenuScreen}
        options={{ title: 'Home', ...SCREEN_OPTIONS }}
      />
      <Stack.Screen
        name="Details"
        component={DetailsScreen}
        options={{ title: 'Details', ...SCREEN_OPTIONS }}
      />
    </Stack>
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
  buttonRow: { flexDirection: 'row', gap: 12 },
  buttonPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    backgroundColor: '#2c4f7c',
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
  detailsCard: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#13243a',
  },
  detailsTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  detailsBody: { color: '#cbd5e1', fontSize: 14, textAlign: 'center' },
});
