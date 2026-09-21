<script lang="ts">
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import { PLUS_ICON_URI, REACT_NATIVE_LOGO_URI, SVELTE_LOGO_URI } from './image-uris';
  import { StyleSheet } from '@symbiote-native/svelte';

  const navigation = useStackNavigation();
  let count = $state<number>(0);
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
    brandLogoSvelte: { width: 54 },
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
    counterValue: { color: '#ff3e00', fontSize: 32, fontWeight: 'bold' },
    buttonRow: { flexDirection: 'row', gap: 12 },
    buttonPrimary: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 22,
      backgroundColor: '#ff3e00',
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
</script>

<safe-area-view style={styles.screen}>
  <view style={styles.brandRow}>
    <image
      style={[styles.brandLogo, styles.brandLogoReact]}
      resizeMode="contain"
      source={{ uri: REACT_NATIVE_LOGO_URI }}
    />
    <image style={styles.plusIcon} resizeMode="contain" source={{ uri: PLUS_ICON_URI }} />
    <image
      style={[styles.brandLogo, styles.brandLogoSvelte]}
      resizeMode="contain"
      source={{ uri: SVELTE_LOGO_URI }}
    />
  </view>

  <text style={styles.title}>Welcome to SymbioteNative!</text>
  <text style={styles.subtitle}>Framework-agnostic React Native, driven by Svelte.</text>

  <view style={styles.counterCard}>
    <text style={styles.counterLabel}>TAPS</text>
    <text style={styles.counterValue}>{count}</text>
  </view>

  <view style={styles.buttonRow}>
    <pressable style={styles.buttonPrimary} onPress={() => (count += 1)}>
      <text style={styles.buttonPrimaryText}>Tap me</text>
    </pressable>
    <pressable style={styles.buttonSecondary} onPress={() => navigation.current.push('Details')}>
      <text style={styles.buttonSecondaryText}>Go to Details</text>
    </pressable>
  </view>
</safe-area-view>
