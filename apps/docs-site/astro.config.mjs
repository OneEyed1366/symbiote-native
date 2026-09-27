import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

const base = '/';

const byLabel = (a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });

export default defineConfig({
  site: 'https://docs.symbiote-native.dev',
  base,
  integrations: [
    starlight({
      title: 'SymbioteNative',
      description:
        'Framework-agnostic React Native renderer for real native iOS and Android apps.',
      favicon: '/symbiote.svg',
      logo: {
        src: './src/assets/symbiote-logo.svg',
      },
      customCss: ['./src/styles/tokens.css', './src/styles/starlight.css'],
      // Adds the Copy-for-agent actions row under the title.
      components: { PageTitle: './src/components/PageTitle.astro' },
      plugins: [
        starlightLlmsTxt({
          projectName: 'SymbioteNative',
          description:
            'A framework-agnostic renderer for real native iOS and Android apps. It keeps React Native\u2019s native stack \u2014 Fabric, JSI, Yoga, Hermes \u2014 and replaces only the JavaScript renderer, so Vue, Angular, Svelte and Solid drive native views directly, not through React.',
          details: [
            'Application code imports from `@symbiote-native/<framework>`, never from `react-native` \u2014 but `react-native` and `react` stay explicit top-level dependencies of the app, because they are the runtime singleton and the Metro version anchor.',
            'A React Native library that ships a JS *component* (`react-native-*`, `@react-native-community/*`) works only under the React adapter; on any other adapter it reaches a null hook dispatcher and throws. Native views reach other adapters through a `@symbiote-native/*` wrapper package instead.',
            'Each adapter is written in its own idiom \u2014 React hooks, Vue composables, Angular `Renderer2`, Svelte runes, Solid signals \u2014 so do not translate one adapter\u2019s example line-by-line into another.',
          ].join('\n\n'),
          // One set per adapter, so a Vue app's agent ingests the Vue corpus alone rather than
          // five frameworks' worth of near-identical examples.
          customSets: [
            {
              label: 'React',
              description:
                'Everything needed to write a SymbioteNative app with React',
              paths: [
                'docs',
                'docs/quick-start',
                'docs/how-it-works',
                'docs/ai-agents',
                'docs/learn/react',
                'docs/api/react',
                'docs/api/components',
                'docs/api/core',
                'docs/howtos/**',
                'docs/navigation/**',
              ],
            },
            {
              label: 'Vue',
              description:
                'Everything needed to write a SymbioteNative app with Vue',
              paths: [
                'docs',
                'docs/quick-start',
                'docs/how-it-works',
                'docs/ai-agents',
                'docs/learn/vue',
                'docs/api/vue',
                'docs/api/components',
                'docs/api/core',
                'docs/howtos/**',
                'docs/navigation/**',
              ],
            },
            {
              label: 'Angular',
              description:
                'Everything needed to write a SymbioteNative app with Angular',
              paths: [
                'docs',
                'docs/quick-start',
                'docs/how-it-works',
                'docs/ai-agents',
                'docs/learn/angular',
                'docs/api/angular',
                'docs/api/components',
                'docs/api/core',
                'docs/howtos/**',
                'docs/navigation/**',
              ],
            },
            {
              label: 'Svelte',
              description:
                'Everything needed to write a SymbioteNative app with Svelte',
              paths: [
                'docs',
                'docs/quick-start',
                'docs/how-it-works',
                'docs/ai-agents',
                'docs/learn/svelte',
                'docs/api/svelte',
                'docs/api/components',
                'docs/api/core',
                'docs/howtos/**',
                'docs/navigation/**',
              ],
            },
            {
              label: 'Solid',
              description:
                'Everything needed to write a SymbioteNative app with Solid',
              paths: [
                'docs',
                'docs/quick-start',
                'docs/how-it-works',
                'docs/ai-agents',
                'docs/learn/solid',
                'docs/api/solid',
                'docs/api/components',
                'docs/api/core',
                'docs/howtos/**',
                'docs/navigation/**',
              ],
            },
          ],
          optionalLinks: [
            {
              label: 'GitHub repository',
              url: 'https://github.com/OneEyed1366/symbiote-native',
              description: 'Source, examples for all five adapters, and issues',
            },
          ],
        }),
      ],
      head: [
        {
          // Yandex.Webmaster site verification. The `docs` subdomain is a CNAME to
          // GitHub Pages, so a `yandex-verification` DNS TXT record can't coexist with
          // the CNAME — the meta-tag method is used instead. (Google verifies via a
          // TXT record on the apex, where there is no CNAME.)
          tag: 'meta',
          attrs: { name: 'yandex-verification', content: '2c452926a06c3852' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: 'https://fonts.gstatic.com',
            crossorigin: true,
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap',
          },
        },
        {
          // Restores the bonded framework before paint, AND aligns Starlight's own
          // <Tabs syncKey="framework"> restore mechanism to the same preference:
          // Starlight persists the synced tab under `starlight-synced-tabs__framework`
          // keyed by the tab's LABEL TEXT ("React"/"Vue"/"Angular"), read by its own
          // inline restore script the instant each <starlight-tabs> connects — before
          // this page's body finishes parsing. Writing it here, synchronously in
          // <head>, keeps the two preferences (this site's `symbiote` id and
          // Starlight's own label-keyed store) always in lockstep on load.
          tag: 'script',
          content: `
            try {
              var s = localStorage.getItem('symbiote');
              var id = s === 'vue' || s === 'angular' || s === 'svelte' || s === 'solid' ? s : 'react';
              document.documentElement.dataset.symbiote = id;
              var LABEL = { react: 'React', vue: 'Vue', angular: 'Angular', svelte: 'Svelte', solid: 'Solid' };
              localStorage.setItem('starlight-synced-tabs__framework', LABEL[id]);
            } catch (e) {}
          `,
        },
        {
          // The favicon (public/symbiote.svg) is a static file, so it always renders
          // React's default cyan — mismatched against the bonded accent the head script
          // above already applies to text/borders. Same brand-mark shape, recolored to
          // match, once the nav DOM exists (unlike the script above, this can't run
          // pre-paint — the tab icon has no CSS-var equivalent to starlight.css's
          // .site-title::before, which is why the sidebar logo uses that instead).
          //
          // Docs pages carry no chip switcher of their own — the only way the
          // preference changes there is clicking a synced <Tabs syncKey="framework">
          // tab (see docs/packages/*.mdx). The click listener below mirrors that
          // choice back into the site-wide `symbiote` key + `data-symbiote` attribute
          // (which the CSS brand-color variables already react to) and re-runs the
          // same favicon recolor, so leaving to another page — or back to the
          // landing page — keeps the same bonded framework everywhere.
          tag: 'script',
          content: `
            (function () {
              var GRADIENTS = {
                react: ['#61dafb', '#2bb0d6'],
                vue: ['#42d392', '#35a479'],
                angular: ['#e40035', '#f6007b', '#9c0aab'],
                svelte: ['#ff3e00', '#d63200'],
                solid: ['#4a8bc2', '#2c4f7c'],
              };
              var ID_BY_LABEL = {
                React: 'react',
                Vue: 'vue',
                Angular: 'angular',
                Svelte: 'svelte',
                Solid: 'solid',
              };

              function recolorFavicon() {
                try {
                  var id = document.documentElement.dataset.symbiote || 'react';
                  var stops = GRADIENTS[id] || GRADIENTS.react;
                  var stopTags = stops
                    .map(function (c, i) {
                      return '<stop offset="' + i / (stops.length - 1) + '" stop-color="' + c + '"/>';
                    })
                    .join('');
                  var svg =
                    '<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<rect width="128" height="128" rx="30" fill="#030406"/>' +
                    '<circle cx="64" cy="64" r="46" fill="' + stops[0] + '" opacity="0.35" filter="url(#glow)"/>' +
                    '<path d="M45,20 L68,20 A40 40 0 0 1 108,60 L108,77 A31 31 0 0 1 77,108 L60,108 A40 40 0 0 1 20,68 L20,45 A25 25 0 0 1 45,20 Z" fill="url(#g)"/>' +
                    '<ellipse cx="48" cy="42" rx="14" ry="9" fill="#ffffff" opacity="0.28" filter="url(#sheen)"/>' +
                    '<defs><linearGradient id="g" x1="20" y1="20" x2="108" y2="108" gradientUnits="userSpaceOnUse">' +
                    stopTags +
                    '</linearGradient>' +
                    '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>' +
                    '<filter id="sheen" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>' +
                    '</defs></svg>';
                  var href = 'data:image/svg+xml,' + encodeURIComponent(svg);
                  var icon = document.querySelector('link[rel~="icon"]');
                  if (icon) icon.href = href;
                } catch (e) {}
              }

              document.addEventListener('DOMContentLoaded', recolorFavicon);

              document.addEventListener('click', function (e) {
                var tab =
                  e.target.closest &&
                  e.target.closest('starlight-tabs[data-sync-key="framework"] [role="tab"]');
                if (!tab) return;
                var id = ID_BY_LABEL[tab.textContent.trim()];
                if (!id) return;
                try {
                  localStorage.setItem('symbiote', id);
                } catch (err) {}
                document.documentElement.dataset.symbiote = id;
                recolorFavicon();
              });
            })();
          `,
        },
      ],
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
        // Keep the site i18n-ready. Add `ru` content only when the
        // English docs stabilize and real translations exist.
        // ru: { label: 'Русский', lang: 'ru' },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/OneEyed1366/symbiote-native',
        },
      ],
      sidebar: [
        {
          label: 'Start here',
          collapsed: true,
          items: [
            { label: 'What is SymbioteNative?', slug: 'docs' },
            { label: 'Quick start', slug: 'docs/quick-start' },
            { label: 'How it works', slug: 'docs/how-it-works' },
            { label: 'Use with an AI agent', slug: 'docs/ai-agents' },
          ],
        },
        {
          label: 'Learn',
          collapsed: true,
          items: [
            { label: 'React guide', slug: 'docs/learn/react' },
            { label: 'Vue guide', slug: 'docs/learn/vue' },
            { label: 'Angular guide', slug: 'docs/learn/angular' },
            { label: 'Svelte guide', slug: 'docs/learn/svelte' },
            { label: 'Solid guide', slug: 'docs/learn/solid' },
            { label: 'Styling', slug: 'docs/learn/styling' },
            { label: 'Animations', slug: 'docs/learn/animations' },
            { label: 'Events', slug: 'docs/learn/events' },
          ],
        },
        {
          label: 'How-tos',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'docs/howtos' },
            { label: 'Style a component', slug: 'docs/howtos/styling' },
            { label: 'Animate a value', slug: 'docs/howtos/animations' },
            { label: 'Handle press/change events', slug: 'docs/howtos/events' },
            {
              label: 'Two-way bind a value',
              slug: 'docs/howtos/two-way-binding',
            },
            {
              label: 'Share content across surfaces',
              slug: 'docs/howtos/portals-and-tunnels',
            },
            {
              label: 'Write platform-specific code',
              slug: 'docs/howtos/platform-code',
            },
            {
              label: 'Wrap a third-party native view',
              slug: 'docs/howtos/third-party-views',
            },
            {
              label: 'Wire up an Expo native module',
              slug: 'docs/howtos/expo-native-module-setup',
            },
            {
              label: 'Add a native splash screen',
              slug: 'docs/howtos/splash-screen',
            },
            {
              label: 'Turn on diagnostic logging',
              slug: 'docs/howtos/debugging',
            },
            {
              label: 'Refs and attachments in Svelte',
              slug: 'docs/howtos/svelte-refs-and-attachments',
            },
            {
              label: 'Catch render errors (Svelte)',
              slug: 'docs/howtos/error-boundaries',
            },
            {
              label: 'Reactivity in Solid',
              slug: 'docs/howtos/solid-reactivity',
            },
          ],
        },
        {
          label: 'Navigation',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'docs/navigation' },
            { label: 'Stack navigator', slug: 'docs/navigation/stack' },
            { label: 'Tab navigator', slug: 'docs/navigation/tabs' },
            { label: 'Drawer navigator', slug: 'docs/navigation/drawer' },
            { label: 'Hooks & focus', slug: 'docs/navigation/hooks' },
            { label: 'Linking & state', slug: 'docs/navigation/linking' },
            { label: 'FAQ', slug: 'docs/navigation/faq' },
          ],
        },
        {
          label: 'Testing',
          collapsed: true,
          items: [{ label: 'Vitest + Detox', slug: 'docs/testing' }],
        },
        {
          label: 'Examples',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'docs/examples' },
            { label: 'Counter', slug: 'docs/examples/counter' },
            { label: 'Pressable', slug: 'docs/examples/pressable' },
            { label: 'TextInput', slug: 'docs/examples/text-input' },
          ],
        },
        {
          label: 'API',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'docs/api' },
            { label: 'React', slug: 'docs/api/react' },
            { label: 'Vue', slug: 'docs/api/vue' },
            { label: 'Angular', slug: 'docs/api/angular' },
            { label: 'Svelte', slug: 'docs/api/svelte' },
            { label: 'Solid', slug: 'docs/api/solid' },
            { label: 'Components', slug: 'docs/api/components' },
            { label: 'Core', slug: 'docs/api/core' },
          ],
        },
        {
          label: 'Packages',
          collapsed: true,
          items: [
            {
              label: 'Bare',
              items: [
                { label: 'Android host shims', slug: 'docs/packages/android' },
                { label: 'CSS parser', slug: 'docs/packages/css-parser' },
                { label: 'Slider', slug: 'docs/packages/slider' },
                { label: 'Splash screen', slug: 'docs/packages/splash-screen' },
                { label: 'Test utils', slug: 'docs/packages/test-utils' },
              ].sort(byLabel),
            },
            {
              label: 'Expo',
              items: [
                { label: 'Application', slug: 'docs/packages/application' },
                { label: 'Audio', slug: 'docs/packages/audio' },
                { label: 'Background fetch', slug: 'docs/packages/background-fetch' },
                { label: 'Background task', slug: 'docs/packages/background-task' },
                { label: 'Battery', slug: 'docs/packages/battery' },
                { label: 'Brightness', slug: 'docs/packages/brightness' },
                { label: 'Cellular', slug: 'docs/packages/cellular' },
                { label: 'Clipboard', slug: 'docs/packages/clipboard' },
                { label: 'Crypto', slug: 'docs/packages/crypto' },
                { label: 'Device', slug: 'docs/packages/device' },
                { label: 'File system', slug: 'docs/packages/file-system' },
                { label: 'Haptics', slug: 'docs/packages/haptics' },
                { label: 'Keep awake', slug: 'docs/packages/keep-awake' },
                { label: 'Local auth', slug: 'docs/packages/local-auth' },
                { label: 'Localization', slug: 'docs/packages/localization' },
                { label: 'Location', slug: 'docs/packages/location' },
                { label: 'Media library', slug: 'docs/packages/media-library' },
                { label: 'Network', slug: 'docs/packages/network' },
                { label: 'Notifications', slug: 'docs/packages/notifications' },
                { label: 'Screen orientation', slug: 'docs/packages/screen-orientation' },
                { label: 'Secure store', slug: 'docs/packages/secure-store' },
                { label: 'Sensors', slug: 'docs/packages/sensors' },
                { label: 'Sharing', slug: 'docs/packages/sharing' },
                { label: 'SMS', slug: 'docs/packages/sms' },
                { label: 'SQLite', slug: 'docs/packages/sqlite' },
                { label: 'Standard web crypto', slug: 'docs/packages/standard-web-crypto' },
                { label: 'Store review', slug: 'docs/packages/store-review' },
                { label: 'System UI', slug: 'docs/packages/system-ui' },
                { label: 'Task manager', slug: 'docs/packages/task-manager' },
                { label: 'Tracking transparency', slug: 'docs/packages/tracking-transparency' },
                { label: 'Web browser', slug: 'docs/packages/web-browser' },
              ].sort(byLabel),
            },
          ],
        },
        {
          label: 'Project',
          collapsed: true,
          items: [
            { label: 'Status', slug: 'docs/project/status' },
            { label: 'Roadmap', slug: 'docs/project/roadmap' },
            { label: 'FAQ', slug: 'docs/project/faq' },
          ],
        },
      ],
    }),
  ],
});
