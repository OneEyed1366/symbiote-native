// Where a navigator renders its `<*.Screen>` markers so they can register themselves.
//
// The markers have to be RENDERED for their init to run (screen-registry.ts explains why
// registration is inverted on Svelte), and Svelte turns whitespace between two sibling non-text
// nodes into a REAL text node - svelte-adapter-dom-shim skill §16, a correctness bug rather than
// a formatting one. Naturally formatted app markup
//
//   <Stack>
//     <Stack.Screen name="home" component={Home} />
//     <Stack.Screen name="details" component={Details} />
//   </Stack>
//
// therefore compiles to `from_tree([marker, ' ', marker])`, and each ' ' becomes an RCTRawText
// engine node parented to whatever host tag holds the `{@render children?.()}` call. Inside a
// plain `symbiote-view` that is the invalid "text outside a <Text> component" shape; inside
// RNSScreenStack it is worse, since react-native-screens' native side expects only RNSScreen
// children there.
//
// So the markers are rendered inside a zero-size `symbiote-text` instead: raw text inside an
// RCTText is LEGAL, which turns the hazard from a device crash into a no-op and makes it
// structurally impossible rather than a rule app authors have to remember. The cost is one
// collapsed, non-interactive RCTText per navigator.
export const SCREEN_REGISTRY_HOST_PROPS: Record<string, unknown> = {
  style: { position: 'absolute', width: 0, height: 0, opacity: 0 },
  pointerEvents: 'none',
};
