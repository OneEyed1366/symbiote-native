import { useState } from 'react';
import { StyleSheet } from '@symbiote-native/react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <view style={styles.container}>
      <text>Welcome to SymbioteNative!</text>
      <pressable onPress={() => setCount((value) => value + 1)}>
        <text>Taps: {count}</text>
      </pressable>
    </view>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
