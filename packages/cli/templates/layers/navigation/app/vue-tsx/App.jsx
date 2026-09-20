import { Screen, Stack, useStackNavigation } from '@symbiote-native/navigation/vue';
import { ref } from 'vue';
import './App.css';

const MenuScreen = {
  setup() {
    const navigation = useStackNavigation();
    const count = ref(0);

    return () => (
      <safe-area-view class="screen">
        <view class="brand-row">
          <image
            class="brand-logo brand-logo-react"
            resizeMode="contain"
            source={require('./assets/react-native-logo.png')}
          />
          <image
            class="plus-icon"
            resizeMode="contain"
            source={require('./assets/plus-icon.png')}
          />
          <image
            class="brand-logo brand-logo-vue"
            resizeMode="contain"
            source={require('./assets/vue-logo.png')}
          />
        </view>
        <text class="title">Welcome to SymbioteNative!</text>
        <text class="subtitle">Framework-agnostic React Native, driven by Vue.</text>

        <view class="counter-card">
          <text class="counter-label">TAPS</text>
          <text class="counter-value">{count.value}</text>
        </view>

        <view class="button-row">
          <pressable class="button-primary" onPress={() => count.value++}>
            <text class="button-primary-text">Tap me</text>
          </pressable>
          <pressable class="button-secondary" onPress={() => navigation.value.push('Details')}>
            <text class="button-secondary-text">Go to Details</text>
          </pressable>
        </view>
      </safe-area-view>
    );
  },
};

const DetailsScreen = {
  setup() {
    const navigation = useStackNavigation();

    return () => (
      <safe-area-view class="screen">
        <view class="details-card">
          <text class="details-title">You made it!</text>
          <text class="details-body">
            This screen was pushed by the Stack navigator — proof navigation actually works.
          </text>
        </view>
        <pressable class="button-secondary" onPress={() => navigation.value.pop()}>
          <text class="button-secondary-text">Go back</text>
        </pressable>
      </safe-area-view>
    );
  },
};

const SCREEN_OPTIONS = {
  headerTranslucent: true,
  headerTintColor: '#ffffff',
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

export default {
  setup() {
    return () => (
      <Stack initialRouteName="Menu">
        <Screen name="Menu" component={MenuScreen} options={{ title: 'Home', ...SCREEN_OPTIONS }} />
        <Screen
          name="Details"
          component={DetailsScreen}
          options={{ title: 'Details', ...SCREEN_OPTIONS }}
        />
      </Stack>
    );
  },
};
