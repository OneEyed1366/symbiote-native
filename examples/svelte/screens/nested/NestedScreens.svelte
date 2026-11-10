<!-- This tab is the content of a root Stack screen, `getParent()` reaches that Stack -->
<script lang="ts">
  import { useNavigation } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import ScreenHero from '../../components/ScreenHero.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { LINE_COLOR } from '../../navigation-lines';
  import { recipeById } from '../../navigation-recipes';
  import { ROUTE_NAME } from '../../routes';
  import { useNestedPanel } from './nested-panel';
  import { CONTAINER_CHOICES } from './nested-settings';

  const COLOR = LINE_COLOR.structure;
  const parentRecipe = recipeById('nested-parent');
  const headerRecipe = recipeById('nested-double-header');
  const containerRecipe = recipeById('nested-container');

  const panel = useNestedPanel();
  const navigation = useNavigation();
  const parent = $derived(navigation.current.getParent());
  const canPopParent = $derived(parent !== undefined && 'pop' in parent);

  function popParent() {
    if (parent !== undefined && 'pop' in parent) parent.pop();
  }
</script>

<scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
  <view class="scroll-content">
    <ScreenHero
      route={ROUTE_NAME.NestedNavigators}
      title="Nested navigators"
      body="A Tab navigator inside a Stack screen, with a Stack inside one of its tabs."
    />
    <Recipe recipe={parentRecipe}>
      <text class="info-text">
        {`parent navigator reachable via getParent(): ${canPopParent ? 'yes (Stack)' : 'no'}`}
      </text>
      <ActionButton
        testID="nested-pop-parent"
        title="Pop parent Stack (via getParent)"
        onPress={popParent}
        color={COLOR}
      />
    </Recipe>
    <Recipe recipe={headerRecipe}>
      <SwitchRow
        testID="nested-parent-header"
        label="headerShown of the parent screen"
        value={panel.settings.isParentHeader}
        onChange={isParentHeader => panel.update({ isParentHeader })}
        color={COLOR}
      />
    </Recipe>
    <Recipe recipe={containerRecipe}>
      <LabeledChoice
        testID="nested-container"
        label="nativeContainerStyle of the inner Stack"
        value={panel.settings.container}
        options={CONTAINER_CHOICES}
        onChange={container => panel.update({ container })}
        color={COLOR}
      />
    </Recipe>
  </view>
</scroll-view>
