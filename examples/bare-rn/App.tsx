import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { BenchmarkScreen } from './screens/BenchmarkScreen';

// This app exists only to produce the stock-React-Native baseline the SymbioteNative adapter
// numbers are compared against. It looks almost exactly like the canaries, so the banner is
// deliberately loud: a screenshot of the wrong app silently corrupts the whole comparison.
export default function App() {
  return (
    <SafeAreaView style={styles.appRoot}>
      <StatusBar barStyle="light-content" backgroundColor="#7f1d1d" />
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Original React Native, not Symbiote Native
        </Text>
      </View>
      <BenchmarkScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#0b1622',
  },
  // Red, and the only warm-red surface in either app — no canary screen uses this hue, so the
  // two are told apart from a thumbnail.
  banner: {
    backgroundColor: '#7f1d1d',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 16,
    paddingRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
