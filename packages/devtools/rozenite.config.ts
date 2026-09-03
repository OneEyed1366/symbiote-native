// Rozenite plugin configuration — read by @rozenite/vite-plugin's browser-panel build
// (rozeniteClientPlugin, gated behind `rozenite.config.ts` existing at the package root; see
// the symbiote-devtools-inspector skill for how this was diagnosed). Two panels, one tab each,
// both against the same app-side broadcast (DEVTOOLS_PLUGIN_ID in src/protocol.ts): "Components"
// answers "what did I write" (owner-tagged developer tree, no native primitives at all);
// "Native Tree" answers "what actually painted" (raw RCTView/RCTText tree, no component
// grouping) — deliberately two panels, not one hybrid view; see the skill for why.
export default {
  panels: [
    {
      name: 'Components',
      source: './src/components-panel.tsx',
    },
    {
      name: 'Native Tree',
      source: './src/native-tree-panel.tsx',
    },
  ],
};
