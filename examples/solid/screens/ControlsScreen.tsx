// Waves 1-3: the components that need a real host to mean anything — the responder/press
// lifecycle, native-owned scroll offset, the soft keyboard, and a second native window.
//
// The order KeyboardAvoidingView > ScrollView is load-bearing: the text field near the bottom is
// only at risk of being covered in that arrangement, which is the thing worth looking at. The
// SafeAreaView above this lives in CanaryScreen.tsx, shared by all four tabs.

import { createSignal } from 'solid-js';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
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
        <view class="card">
          {/* No hand-written resolveImageSource any more: the shared render fn resolves the asset
              inside the render accessor, which runs after bootstrapHost installed the resolver. */}
          <image
            class="logo"
            source={require('../assets/bootsplash/logo.png')}
            resizeMode="contain"
          />
          <text class="title">SymbioteNative</text>
          <text class="subtitle">
            Solid adapter — static paint through solid-js/universal, with
            React's renderer nowhere in the path.
          </text>

          <view class="row">
            <text class="row-label">Wi-Fi — {wifi() ? 'on' : 'off'}</text>
            <switch
              value={wifi()}
              onValueChange={event => setWifi(event.value)}
              trackColor={{ true: '#2c4f82', false: '#3a3a3c' }}
            />
          </view>

          {/* The snap-back probe: this parent REFUSES the toggle, but native has already flipped
              its own grip by the time onValueChange fires, so JS must command the old value back
              down. */}
          <view class="row">
            <text class="row-label">Locked — must spring back</text>
            <switch value={false} onValueChange={() => {}} />
          </view>

          {/* The state arrives as an ACCESSOR, unlike React/Vue/Svelte. Calling it inside the leaf
              is the point: this function runs once, and Solid's `insert` replaces a subtree rather
              than diffing it (.claude/rules/solid-descriptor-bridge.md §4). */}
          <Pressable class="row" onPress={() => setBusy(current => !current)}>
            {state => (
              <>
                <text class="row-label">
                  {state().pressed ? 'Pressed…' : 'Tap to toggle the spinner'}
                </text>
                {busy() ? (
                  <activity-indicator size="small" color="#7aa2e3" />
                ) : (
                  <text class="row-label">off</text>
                )}
              </>
            )}
          </Pressable>
        </view>

        {/* Filler, so the scroll offset is genuinely native-owned rather than a no-op. */}
        <view class="card">
          <text class="section">
            Scroll me — the offset lives on the native side
          </text>
          <text class="subtitle">
            Pull down past the top to fire RefreshControl; the spinner clears
            itself after a moment.
          </text>
          <view class="filler" />
        </view>

        {/* The controlled handshake: native has already painted the keystroke by the time JS sees
            it, so the echo below proves the round trip rather than the keyboard's own display. */}
        <view class="card">
          <text class="section">TextInput</text>
          <TextInput
            class="input"
            value={note()}
            onValueChange={event => setNote(event.text)}
            placeholder="Type here — the echo is the round trip"
            placeholderTextColor="#5b678f"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />
          <text class="row-label">
            echo: {note() === '' ? '(empty)' : note()}
          </text>
        </view>

        <Pressable class="card" onPress={() => setSheetOpen(true)}>
          {() => <text class="section">Open the Modal</text>}
        </Pressable>
      </ScrollView>

      <Modal
        visible={sheetOpen()}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetOpen(false)}
      >
        <view class="sheet-backdrop">
          <view class="sheet">
            <text class="section">A second native window</text>
            <text class="subtitle">
              Not a JS overlay — RCTModalHostView commits through the same
              childSet as the rest of the tree.
            </text>
            <Pressable class="row" onPress={() => setSheetOpen(false)}>
              {() => <text class="row-label">Close</text>}
            </Pressable>
          </view>
        </view>
      </Modal>
    </KeyboardAvoidingView>
  );
}
