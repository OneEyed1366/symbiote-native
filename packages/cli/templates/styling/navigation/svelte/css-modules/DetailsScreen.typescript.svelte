<script lang="ts">
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import styles from './App.module.css';

  const navigation = useStackNavigation();
</script>

<safe-area-view class={styles['screen']}>
  <view class={styles['details-card']}>
    <text class={styles['details-title']}>You made it!</text>
    <text class={styles['details-body']}>
      This screen was pushed by the Stack navigator — proof navigation actually works.
    </text>
  </view>
  <pressable class={styles['button-secondary']} onPress={() => navigation.current.pop()}>
    <text class={styles['button-secondary-text']}>Go back</text>
  </pressable>
</safe-area-view>
