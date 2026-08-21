// Waves 1-3: the components that need a real host to mean anything — the responder/press
// lifecycle, native-owned scroll offset, the soft keyboard, and a second native window.
//
// The order KeyboardAvoidingView > ScrollView is load-bearing: the text field near the bottom is
// only at risk of being covered in that arrangement, which is the thing worth looking at. The
// SafeAreaView above this lives in CanaryScreen.tsx, shared by all four tabs.

import { createSignal } from 'solid-js';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch as Toggle,
  Text,
  TextInput,
  View,
} from '@symbiote-native/solid';

const REFRESH_MS = 1_200;

export function ControlsScreen() {
  const [wifi, setWifi] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  const [note, setNote] = createSignal('');
  const [sheetOpen, setSheetOpen] = createSignal(false);

  const refresh = (): void => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), REFRESH_MS);
  };

  return (
    <KeyboardAvoidingView class="avoider" behavior="padding">
      <ScrollView
        class="scroll"
        contentContainerStyle="content"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing()}
            onRefresh={refresh}
            tintColor="#7aa2e3"
          />
        }
      >
        <View class="card">
          {/* No hand-written resolveImageSource any more: the shared render fn resolves the asset
              inside the render accessor, which runs after bootstrapHost installed the resolver. */}
          <Image
            class="logo"
            source={require('../assets/bootsplash/logo.png')}
            resizeMode="contain"
          />
          <Text class="title">SymbioteNative</Text>
          <Text class="subtitle">
            Solid adapter — static paint through solid-js/universal, with
            React's renderer nowhere in the path.
          </Text>

          <View class="row">
            <Text class="row-label">Wi-Fi — {wifi() ? 'on' : 'off'}</Text>
            <Toggle
              value={wifi()}
              onValueChange={setWifi}
              trackColor={{ true: '#2c4f82', false: '#3a3a3c' }}
            />
          </View>

          {/* The snap-back probe: this parent REFUSES the toggle, but native has already flipped
              its own grip by the time onValueChange fires, so JS must command the old value back
              down. */}
          <View class="row">
            <Text class="row-label">Locked — must spring back</Text>
            <Toggle value={false} onValueChange={() => {}} />
          </View>

          {/* The state arrives as an ACCESSOR, unlike React/Vue/Svelte. Calling it inside the leaf
              is the point: this function runs once, and Solid's `insert` replaces a subtree rather
              than diffing it (.claude/rules/solid-descriptor-bridge.md §4). */}
          <Pressable class="row" onPress={() => setBusy(current => !current)}>
            {state => (
              <>
                <Text class="row-label">
                  {state().pressed ? 'Pressed…' : 'Tap to toggle the spinner'}
                </Text>
                {busy() ? (
                  <ActivityIndicator size="small" color="#7aa2e3" />
                ) : (
                  <Text class="row-label">off</Text>
                )}
              </>
            )}
          </Pressable>
        </View>

        {/* Filler, so the scroll offset is genuinely native-owned rather than a no-op. */}
        <View class="card">
          <Text class="section">
            Scroll me — the offset lives on the native side
          </Text>
          <Text class="subtitle">
            Pull down past the top to fire RefreshControl; the spinner clears
            itself after a moment.
          </Text>
          <View class="filler" />
        </View>

        {/* The controlled handshake: native has already painted the keystroke by the time JS sees
            it, so the echo below proves the round trip rather than the keyboard's own display. */}
        <View class="card">
          <Text class="section">TextInput</Text>
          <TextInput
            class="input"
            value={note()}
            onValueChange={setNote}
            placeholder="Type here — the echo is the round trip"
            placeholderTextColor="#5b678f"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
          <Text class="row-label">
            echo: {note() === '' ? '(empty)' : note()}
          </Text>
        </View>

        <Pressable class="card" onPress={() => setSheetOpen(true)}>
          {() => <Text class="section">Open the Modal</Text>}
        </Pressable>
      </ScrollView>

      <Modal
        visible={sheetOpen()}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetOpen(false)}
      >
        <View class="sheet-backdrop">
          <View class="sheet">
            <Text class="section">A second native window</Text>
            <Text class="subtitle">
              Not a JS overlay — RCTModalHostView commits through the same
              childSet as the rest of the tree.
            </Text>
            <Pressable class="row" onPress={() => setSheetOpen(false)}>
              {() => <Text class="row-label">Close</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
