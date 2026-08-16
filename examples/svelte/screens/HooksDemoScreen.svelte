<script lang="ts">
  // Hooks demo: useFocusEffect increments a counter every time this screen (re)gains focus and logs
  // the moment it loses it; useIsFocused visibly renders the live true/false; useNavigationState
  // selects the whole route-name stack straight out of the root Stack's reducer state and renders it
  // as a list — navigate away and back (or push another screen) to watch all three update.
  // useFocusEffect's `effect` closure needs no memoization here (unlike React's useCallback
  // requirement) — a Svelte component's script runs exactly ONCE, so the rune reads it once by
  // value and closes over it directly (see runes/use-focus-effect.svelte.ts). Svelte twin of
  // examples/vue-sfc/screens/HooksDemoScreen.vue.
  import { SafeAreaView, Text, View } from '@symbiote-native/svelte';
  import {
    useFocusEffect,
    useIsFocused,
    useNavigationState,
  } from '@symbiote-native/navigation/svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  let focusCount = $state(0);
  let lastBlurAt = $state<number | undefined>(undefined);
  const isFocused = useIsFocused();
  const routeNames = useNavigationState(state => state.routes.map(route => route.name));
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.HooksDemo];

  useFocusEffect(() => {
    focusCount += 1;
    return () => {
      lastBlurAt = Date.now();
    };
  });
</script>

<SafeAreaView class="screen"
  ><View class="section"
    ><View class={`line-tag line-tag-${lineInfo.line}`}
      ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
    ><View class="hero-card"
      ><View class="hero-badge" style={{ backgroundColor: LINE_COLOR.introspection }}
        ><Text class="hero-badge-text">HK</Text></View
      ><View class="hero-copy"
        ><Text class="hero-title">Hooks</Text
        ><Text class="hero-body">useFocusEffect, useIsFocused, and useNavigationState — introspecting the navigator's own live state from inside a screen.</Text
      ></View
    ></View
    ><Text testID="hooks-is-focused" class="info-text">{`useIsFocused(): ${isFocused.current}`}</Text
    ><Text testID="hooks-focus-count" class="info-text">{`useFocusEffect focus count: ${focusCount}`}</Text
    ><Text class="info-text">{lastBlurAt === undefined ? 'not blurred yet' : `last blurred at ${lastBlurAt}`}</Text
    ><Text class="section-label">useNavigationState() · current route stack</Text
    >{#each routeNames.current as name, index (`${name}-${index}`)}<Text class="list-row-text">{`${index}. ${name}`}</Text
    >{/each}</View
  ></SafeAreaView
>
