import { createSignal } from 'solid-js';
import './App.css';

export default function App() {
  const [count, setCount] = createSignal<number>(0);

  return (
    <safe-area-view class="screen">
      <view class="brand-row">
        <image
          class="brand-logo brand-logo-react"
          resizeMode="contain"
          source={require('./assets/react-native-logo.png')}
        />
        <image class="plus-icon" resizeMode="contain" source={require('./assets/plus-icon.png')} />
        <image
          class="brand-logo brand-logo-solid"
          resizeMode="contain"
          source={require('./assets/solid-logo.png')}
        />
      </view>
      <text class="title">Welcome to SymbioteNative!</text>
      <text class="subtitle">Framework-agnostic React Native, driven by Solid.</text>

      <view class="counter-card">
        <text class="counter-label">TAPS</text>
        <text class="counter-value">{count()}</text>
      </view>

      <pressable class="button-primary" onPress={() => setCount((value) => value + 1)}>
        <text class="button-primary-text">Tap me</text>
      </pressable>
    </safe-area-view>
  );
}
