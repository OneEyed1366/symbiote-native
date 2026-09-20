<script>
  import styles from './App.module.css';

  let count = $state(0);
</script>

<view class={styles.container}>
  <text>Welcome to SymbioteNative!</text>
  <pressable onPress={() => count++}>
    <text>Taps: {count}</text>
  </pressable>
</view>
