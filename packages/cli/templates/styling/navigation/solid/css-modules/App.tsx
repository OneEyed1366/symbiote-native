import { Stack, useStackNavigation } from '@symbiote-native/navigation/solid';
import styles from './App.module.css';

function MenuScreen() {
  const navigation = useStackNavigation();

  return (
    <view class={styles.container}>
      <text>Welcome to SymbioteNative!</text>
      <pressable onPress={() => navigation().push('Details')}>
        <text>Go to Details</text>
      </pressable>
    </view>
  );
}

function DetailsScreen() {
  return (
    <view class={styles.container}>
      <text>Details screen</text>
    </view>
  );
}

export default function App() {
  return (
    <Stack initialRouteName="Menu">
      <Stack.Screen name="Menu" component={MenuScreen} options={{ title: 'Home' }} />
      <Stack.Screen name="Details" component={DetailsScreen} options={{ title: 'Details' }} />
    </Stack>
  );
}
