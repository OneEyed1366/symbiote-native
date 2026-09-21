import { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <safe-area-view className={styles['screen']}>
      <image
        className={styles['brand-logo']}
        resizeMode="contain"
        source={require('./assets/react-native-logo.png')}
      />
      <text className={styles['title']}>Welcome to SymbioteNative!</text>
      <text className={styles['subtitle']}>Framework-agnostic React Native, driven by React.</text>

      <view className={styles['counter-card']}>
        <text className={styles['counter-label']}>TAPS</text>
        <text className={styles['counter-value']}>{count}</text>
      </view>

      <pressable className={styles['button-primary']} onPress={() => setCount((value) => value + 1)}>
        <text className={styles['button-primary-text']}>Tap me</text>
      </pressable>
    </safe-area-view>
  );
}
