<script>
  import { PLUS_ICON_URI, REACT_NATIVE_LOGO_URI, SVELTE_LOGO_URI } from './image-uris';
  import styles from './App.module.css';

  let count = $state(0);
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

  <pressable class={styles['button-primary']} onPress={() => count++}>
    <text class={styles['button-primary-text']}>Tap me</text>
  </pressable>
</safe-area-view>
