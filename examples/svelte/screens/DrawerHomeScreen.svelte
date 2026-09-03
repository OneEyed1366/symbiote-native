<script lang="ts">
  // Drawer demo · Home: this screen is mounted under a Drawer, so useDrawerNavigation() hands back
  // the Drawer-specific handle (openDrawer/closeDrawer/toggleDrawer/jumpTo) directly — no
  // narrowing. Svelte twin of examples/vue-sfc/screens/DrawerHomeScreen.vue.
  import { SafeAreaView, Text, View } from '@symbiote-native/svelte';
  import { useDrawerNavigation } from '@symbiote-native/navigation/svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import ActionButton from '../components/ActionButton.svelte';

  const navigation = useDrawerNavigation();
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];
</script>

<SafeAreaView class="screen">
  <View class="section">
    <View class={`line-tag line-tag-${lineInfo.line}`}>
      <Text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </Text>
    </View>
    <View class="hero-card">
      <View
        class="hero-badge"
        style={{ backgroundColor: LINE_COLOR.structure }}
      >
        <Text class="hero-badge-text">DR</Text>
      </View>
      <View class="hero-copy">
        <Text class="hero-title">Drawer</Text>
        <Text class="hero-body">
          A swipeable drawer sliding in from the right, driven by the
          navigator's own gesture handler.
        </Text>
      </View>
    </View>
    <Text class="info-text">
      drawerPosition: right · drawerType: slide — swipe from the RIGHT edge, or
      use a button
    </Text>
    <ActionButton
      testID="drawer-open"
      title="Open drawer"
      onPress={() => navigation.current.openDrawer()}
      color={LINE_COLOR.structure}
    />
    <ActionButton
      testID="drawer-toggle"
      title="Toggle drawer"
      onPress={() => navigation.current.toggleDrawer()}
      color={LINE_COLOR.structure}
    />
  </View>
</SafeAreaView>
