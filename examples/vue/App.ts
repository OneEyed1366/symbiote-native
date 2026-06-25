// The Vue canary app: a counter on the symbiote engine. Plain render functions (no SFC),
// so Metro needs no Vue transformer — @react-native/babel-preset just strips the types.
// Tapping the box re-enters Vue's reactivity, which recommits through @symbiote/engine
// into Fabric with React Native's renderer never in the path — the M3 / R4 device proof.
//
// The tap is the raw responder protocol (onStartShouldSetResponder + onResponderRelease),
// not Pressable — the press-retention controller arrives with @symbiote/components. Both
// handlers are first-class listeners in the shared event layer, so a bare View is tappable.

import { defineComponent, h, ref } from '@vue/runtime-core'
import { View, Text } from '@symbiote/vue'

export default defineComponent({
  name: 'VueCanary',
  setup() {
    const taps = ref(0)

    return () =>
      h(
        View,
        {
          style: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0b1021',
          },
        },
        () => [
          h(
            Text,
            { style: { color: '#e2e8f0', fontSize: 26, marginBottom: 28 } },
            () => `Taps: ${taps.value}`,
          ),
          h(
            View,
            {
              onStartShouldSetResponder: () => true,
              onResponderRelease: () => {
                taps.value += 1
              },
              style: {
                backgroundColor: '#4f46e5',
                paddingVertical: 14,
                paddingHorizontal: 32,
                borderRadius: 10,
              },
            },
            () => [h(Text, { style: { color: '#ffffff', fontSize: 18 } }, () => 'Tap me')],
          ),
        ],
      )
  },
})
