<script lang="ts">
  import { useDrawerNavigation } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { LINE_COLOR } from '../../navigation-lines';
  import { recipeById } from '../../navigation-recipes';
  import { useDrawerPanel } from './drawer-panel';
  import {
    DISTANCE_CHOICES,
    DRAWER_POSITIONS,
    DRAWER_TYPES,
    EDGE_CHOICES,
    OVERLAY_CHOICES,
    VELOCITY_CHOICES,
    WIDTH_CHOICES,
  } from './drawer-settings';

  const COLOR = LINE_COLOR.structure;
  const typeRecipe = recipeById('drawer-type');
  const positionRecipe = recipeById('drawer-position');
  const widthRecipe = recipeById('drawer-width');
  const overlayRecipe = recipeById('drawer-overlay');
  const swipeRecipe = recipeById('drawer-swipe');
  const contentRecipe = recipeById('drawer-content');

  // The drawer props are the panel, the Drawer above reads them on every render
  const panel = useDrawerPanel();
  const navigation = useDrawerNavigation();
</script>

<Recipe recipe={typeRecipe}>
  <LabeledChoice
    testID="drawer-type"
    label="drawerType"
    value={panel.settings.drawerType}
    options={DRAWER_TYPES}
    onChange={drawerType => panel.update({ drawerType })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={positionRecipe}>
  <LabeledChoice
    testID="drawer-position"
    label="drawerPosition"
    value={panel.settings.drawerPosition}
    options={DRAWER_POSITIONS}
    onChange={drawerPosition => panel.update({ drawerPosition })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={widthRecipe}>
  <LabeledChoice
    testID="drawer-width"
    label="drawerWidth"
    value={panel.settings.width}
    options={WIDTH_CHOICES}
    onChange={width => panel.update({ width })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={overlayRecipe}>
  <LabeledChoice
    testID="drawer-overlay"
    label="overlayColor"
    value={panel.settings.overlay}
    options={OVERLAY_CHOICES}
    onChange={overlay => panel.update({ overlay })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={swipeRecipe}>
  <SwitchRow
    testID="drawer-swipe-enabled"
    label="swipeEnabled"
    value={panel.settings.isSwipeEnabled}
    onChange={isSwipeEnabled => panel.update({ isSwipeEnabled })}
    color={COLOR}
  />
  <LabeledChoice
    testID="drawer-edge"
    label="swipeEdgeWidth"
    value={panel.settings.edge}
    options={EDGE_CHOICES}
    onChange={edge => panel.update({ edge })}
    color={COLOR}
  />
  <LabeledChoice
    testID="drawer-distance"
    label="swipeMinDistance"
    value={panel.settings.distance}
    options={DISTANCE_CHOICES}
    onChange={distance => panel.update({ distance })}
    color={COLOR}
  />
  <LabeledChoice
    testID="drawer-velocity"
    label="swipeMinVelocity"
    value={panel.settings.velocity}
    options={VELOCITY_CHOICES}
    onChange={velocity => panel.update({ velocity })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={contentRecipe}>
  <ActionButton
    testID="drawer-open"
    title="Open drawer"
    onPress={() => navigation.current.openDrawer()}
    color={COLOR}
  />
  <ActionButton
    testID="drawer-toggle"
    title="Toggle drawer"
    onPress={() => navigation.current.toggleDrawer()}
    color={COLOR}
  />
</Recipe>
