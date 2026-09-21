import { Stack, useStackNavigation } from '@symbiote-native/navigation/react';
import { useState } from 'react';
import './App.css';

function MenuScreen() {
  const navigation = useStackNavigation();
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

      <view className="button-row">
        <pressable className="button-primary" onPress={() => setCount(count + 1)}>
          <text className="button-primary-text">Tap me</text>
        </pressable>
        <pressable className="button-secondary" onPress={() => navigation.push('Details')}>
          <text className="button-secondary-text">Go to Details</text>
        </pressable>
      </view>
    </safe-area-view>
  );
}

function DetailsScreen() {
  const navigation = useStackNavigation();

  return (
    <safe-area-view className="screen">
      <view className="details-card">
        <text className="details-title">You made it!</text>
        <text className="details-body">
          This screen was pushed by the Stack navigator — proof navigation actually works.
        </text>
      </view>
      <pressable className="button-secondary" onPress={() => navigation.pop()}>
        <text className="button-secondary-text">Go back</text>
      </pressable>
    </safe-area-view>
  );
}

const SCREEN_OPTIONS = {
  headerTranslucent: true,
  headerTintColor: '#ffffff',
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

export default function App() {
  return (
    <Stack initialRouteName="Menu">
      <Stack.Screen
        name="Menu"
        component={MenuScreen}
        options={{ title: 'Home', ...SCREEN_OPTIONS }}
      />
      <Stack.Screen
        name="Details"
        component={DetailsScreen}
        options={{ title: 'Details', ...SCREEN_OPTIONS }}
      />
    </Stack>
  );
}
