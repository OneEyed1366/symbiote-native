import { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <view className={styles.container}>
      <text>Welcome to SymbioteNative!</text>
      <pressable onPress={() => setCount((value) => value + 1)}>
        <text>Taps: {count}</text>
      </pressable>
    </view>
  );
}
