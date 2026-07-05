// A true module-level singleton — the whole point of createTunnel is that it's importable
// from a genuinely different surface, unlike Teleport's target ref. Kept in its own file
// rather than inline in App.vue's <script setup>, since an SFC's
// <script setup> body re-runs per component INSTANCE, not per module — this file is what
// actually gives every importer the SAME tunnel.
import { createTunnel } from '@symbiote-native/vue';

export const tunnelDemo = createTunnel();
