import { Stack, useStackNavigation } from '@symbiote-native/navigation/react';
import { useState } from 'react';
import styles from './App.module.css';

function MenuScreen() {
  const navigation = useStackNavigation();
  const [count, setCount] = useState<number>(0);

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

      <view className={styles['button-row']}>
        <pressable className={styles['button-primary']} onPress={() => setCount(count + 1)}>
          <text className={styles['button-primary-text']}>Tap me</text>
        </pressable>
        <pressable className={styles['button-secondary']} onPress={() => navigation.push('Details')}>
          <text className={styles['button-secondary-text']}>Go to Details</text>
        </pressable>
      </view>
    </safe-area-view>
  );
}

function DetailsScreen() {
  const navigation = useStackNavigation();

  return (
    <safe-area-view className={styles['screen']}>
      <view className={styles['details-card']}>
        <text className={styles['details-title']}>You made it!</text>
        <text className={styles['details-body']}>
          This screen was pushed by the Stack navigator — proof navigation actually works.
        </text>
      </view>
      <pressable className={styles['button-secondary']} onPress={() => navigation.pop()}>
        <text className={styles['button-secondary-text']}>Go back</text>
      </pressable>
    </safe-area-view>
  );
}

const SCREEN_OPTIONS = {
  headerTranslucent: true,
  headerTintColor: '#ffffff',
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark' as const,
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
