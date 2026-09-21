import { createSignal } from 'solid-js';
import styles from './App.module.css';

export default function App() {
  const [count, setCount] = createSignal<number>(0);

  return (
    <view class={styles.container}>
      <text>Welcome to SymbioteNative!</text>
      <pressable onPress={() => setCount((value) => value + 1)}>
        <text>Taps: {count()}</text>
      </pressable>
    </view>
  );
}
