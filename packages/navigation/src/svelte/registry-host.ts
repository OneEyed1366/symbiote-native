// Where a navigator renders its `<*.Screen>` markers so they can register themselves.
//
// The markers have to be rendered for their init to run (see `screen-registry.ts`), and Svelte
// turns whitespace between two sibling non-text nodes into a real text node, a correctness bug
// Naturally formatted app markup
//
//   <Stack>
//     <Stack.Screen name="home" component={Home} />
//     <Stack.Screen name="details" component={Details} />
//   </Stack>
//
// therefore compiles to `from_tree([marker, ' ', marker])`, and each ' ' becomes an RCTRawText
// engine node parented to whatever host tag holds the `{@render children?.()}` call. Inside a
// plain `view` that is the invalid "text outside a <text> component" shape; inside
// RNSScreenStack it is worse, since react-native-screens' native side expects only RNSScreen
// children there.
//
// So the markers are rendered inside a zero-size `text` instead: raw text inside an
// RCTText is LEGAL, which turns the hazard from a device crash into a no-op and makes it
// structurally impossible rather than a rule app authors have to remember. The cost is one
// collapsed, non-interactive RCTText per navigator.
export const SCREEN_REGISTRY_HOST_PROPS: Record<string, unknown> = {
  style: { position: 'absolute', width: 0, height: 0, opacity: 0 },
  pointerEvents: 'none',
};
