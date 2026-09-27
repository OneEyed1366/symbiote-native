<script lang="ts">
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import { PLUS_ICON_URI, REACT_NATIVE_LOGO_URI, SVELTE_LOGO_URI } from './image-uris';
  import styles from './App.module.css';

  const navigation = useStackNavigation();
  let count = $state<number>(0);
</script>

<safe-area-view class={styles['screen']}>
  <view class={styles['brand-row']}>
    <image
      class={`${styles['brand-logo']} ${styles['brand-logo-react']}`}
      resizeMode="contain"
      source={{ uri: REACT_NATIVE_LOGO_URI }}
    />
    <image class={styles['plus-icon']} resizeMode="contain" source={{ uri: PLUS_ICON_URI }} />
    <image
      class={`${styles['brand-logo']} ${styles['brand-logo-svelte']}`}
      resizeMode="contain"
      source={{ uri: SVELTE_LOGO_URI }}
    />
  </view>

  <text class={styles['title']}>Welcome to SymbioteNative!</text>
  <text class={styles['subtitle']}>Framework-agnostic React Native, driven by Svelte.</text>

  <view class={styles['counter-card']}>
    <text class={styles['counter-label']}>TAPS</text>
    <text class={styles['counter-value']}>{count}</text>
  </view>

  <view class={styles['button-row']}>
    <pressable class={styles['button-primary']} onPress={() => (count += 1)}>
      <text class={styles['button-primary-text']}>Tap me</text>
    </pressable>
    <pressable class={styles['button-secondary']} onPress={() => navigation.current.push('Details')}>
      <text class={styles['button-secondary-text']}>Go to Details</text>
    </pressable>
  </view>
</safe-area-view>
