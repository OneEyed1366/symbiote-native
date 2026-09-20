import { Screen, Stack, useStackNavigation } from '@symbiote-native/navigation/vue';
import { StyleSheet } from '@symbiote-native/vue';

function MenuScreen() {
  const navigation = useStackNavigation();

  return (
    <view style={styles.container}>
      <text>Welcome to SymbioteNative!</text>
      <pressable onPress={() => navigation.push('Details')}>
        <text>Go to Details</text>
      </pressable>
    </view>
  );
}

function DetailsScreen() {
  return (
    <view style={styles.container}>
      <text>Details screen</text>
    </view>
  );
}

export default {
  setup() {
    return () => (
      <Stack initialRouteName="Menu">
        <Screen name="Menu" component={MenuScreen} options={{ title: 'Home' }} />
        <Screen name="Details" component={DetailsScreen} options={{ title: 'Details' }} />
      </Stack>
    );
  },
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
