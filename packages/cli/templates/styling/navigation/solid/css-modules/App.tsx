import { Stack, useStackNavigation } from '@symbiote-native/navigation/solid';
import { createSignal } from 'solid-js';
import styles from './App.module.css';

function MenuScreen() {
  const navigation = useStackNavigation();
  const [count, setCount] = createSignal<number>(0);

  return (
    <safe-area-view class={styles['screen']}>
      <view class={styles['brand-row']}>
        <image
          class={`${styles['brand-logo']} ${styles['brand-logo-react']}`}
          resizeMode="contain"
          source={require('./assets/react-native-logo.png')}
        />
        <image
          class={styles['plus-icon']}
          resizeMode="contain"
          source={require('./assets/plus-icon.png')}
        />
        <image
          class={`${styles['brand-logo']} ${styles['brand-logo-solid']}`}
          resizeMode="contain"
          source={require('./assets/solid-logo.png')}
        />
      </view>
      <text class={styles['title']}>Welcome to SymbioteNative!</text>
      <text class={styles['subtitle']}>Framework-agnostic React Native, driven by Solid.</text>

      <view class={styles['counter-card']}>
        <text class={styles['counter-label']}>TAPS</text>
        <text class={styles['counter-value']}>{count()}</text>
      </view>

      <view class={styles['button-row']}>
        <pressable class={styles['button-primary']} onPress={() => setCount(count() + 1)}>
          <text class={styles['button-primary-text']}>Tap me</text>
        </pressable>
        <pressable class={styles['button-secondary']} onPress={() => navigation().push('Details')}>
          <text class={styles['button-secondary-text']}>Go to Details</text>
        </pressable>
      </view>
    </safe-area-view>
  );
}

function DetailsScreen() {
  const navigation = useStackNavigation();

  return (
    <safe-area-view class={styles['screen']}>
      <view class={styles['details-card']}>
        <text class={styles['details-title']}>You made it!</text>
        <text class={styles['details-body']}>
          This screen was pushed by the Stack navigator — proof navigation actually works.
        </text>
      </view>
      <pressable class={styles['button-secondary']} onPress={() => navigation().pop()}>
        <text class={styles['button-secondary-text']}>Go back</text>
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
