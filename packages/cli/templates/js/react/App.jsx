import { useState } from 'react';
import './App.css';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <safe-area-view className="screen">
      <image
        className="brand-logo"
        resizeMode="contain"
        source={require('./assets/react-native-logo.png')}
      />
      <text className="title">Welcome to SymbioteNative!</text>
      <text className="subtitle">Framework-agnostic React Native, driven by React.</text>

      <view className="counter-card">
        <text className="counter-label">TAPS</text>
        <text className="counter-value">{count}</text>
      </view>

      <pressable className="button-primary" onPress={() => setCount((value) => value + 1)}>
        <text className="button-primary-text">Tap me</text>
      </pressable>
    </safe-area-view>
  );
}
