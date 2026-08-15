<script lang="ts">
  // This Tab is rendered AS the content of a root-Stack screen (NestedNavigatorsScreen.svelte), so
  // useNavigation() here resolves to the nested Tab's OWN handle, while getParent() walks exactly
  // one hop up the NavigationScope chain to reach the ENCLOSING Stack's handle. Svelte twin of
  // examples/vue-sfc/screens/NestedTabHomeScreen.vue.
  import { SafeAreaView, Text, View } from '@symbiote-native/svelte';
  import { useNavigation } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const navigation = useNavigation();
  const parent = $derived(navigation.current.getParent());
  const canPopParent = $derived(parent !== undefined && 'pop' in parent);
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.NestedNavigators];

  function popParent(): void {
    if (parent !== undefined && 'pop' in parent) parent.pop();
  }
</script>

<SafeAreaView class="screen"
  ><View class="section"
    ><View class={`line-tag line-tag-${lineInfo.line}`}
      ><Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text></View
    ><View class="hero-card"
      ><View class="hero-badge" style={{ backgroundColor: LINE_COLOR.structure }}
        ><Text class="hero-badge-text">NN</Text></View
      ><View class="hero-copy"
        ><Text class="hero-title">Nested navigators</Text
        ><Text class="hero-body">A Tab navigator nested inside a Stack screen, reaching its parent's own navigation handle through getParent().</Text
      ></View
    ></View
    ><Text class="info-text">{`parent navigator reachable via getParent(): ${canPopParent ? 'yes (Stack)' : 'no'}`}</Text
    ><ActionButton
      testID="nested-pop-parent"
      title="Pop parent Stack (via getParent)"
      onPress={popParent}
      color={LINE_COLOR.structure}
    /></View
  ></SafeAreaView
>
