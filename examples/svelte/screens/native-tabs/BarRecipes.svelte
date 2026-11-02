<script lang="ts">
  import ChoiceRow from '../../components/ChoiceRow.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import {
    CONTROLLER_MODE_OPTIONS,
    DIRECTION_OPTIONS,
    MINIMIZE_OPTIONS,
    SCHEME_OPTIONS,
    SIDEBAR_PLACEMENT_OPTIONS,
    useNativeTabsDemo,
  } from './native-tabs-demo.svelte';

  const COLOR = LINE_COLOR.structure;
  const hiddenRecipe = recipeById('native-tabs-hidden');
  const minimizeRecipe = recipeById('native-tabs-minimize');
  const accessoryRecipe = recipeById('native-tabs-accessory');
  const modeRecipe = recipeById('native-tabs-controller-mode');
  const schemeRecipe = recipeById('native-tabs-scheme');

  // Recipes for the options of the whole bar, the host of the native tabs
  const demo = useNativeTabsDemo();
</script>

<Recipe recipe={hiddenRecipe}>
  <SwitchRow
    testID="native-tabs-hidden"
    label="tabBarHidden"
    value={demo.settings.isBarHidden}
    onChange={isBarHidden => demo.update({ isBarHidden })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={minimizeRecipe}>
  <ChoiceRow
    testID="native-tabs-minimize"
    value={demo.settings.minimize}
    options={MINIMIZE_OPTIONS}
    onChange={minimize => demo.update({ minimize })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={accessoryRecipe}>
  <SwitchRow
    testID="native-tabs-accessory"
    label="bottomAccessory visible"
    value={demo.settings.isAccessoryShown}
    onChange={isAccessoryShown => demo.update({ isAccessoryShown })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={modeRecipe}>
  <ChoiceRow
    testID="native-tabs-mode"
    value={demo.settings.controllerMode}
    options={CONTROLLER_MODE_OPTIONS}
    onChange={controllerMode => demo.update({ controllerMode })}
    color={COLOR}
  />
  <ChoiceRow
    testID="native-tabs-placement"
    value={demo.settings.sidebarPlacement}
    options={SIDEBAR_PLACEMENT_OPTIONS}
    onChange={sidebarPlacement => demo.update({ sidebarPlacement })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={schemeRecipe}>
  <ChoiceRow
    testID="native-tabs-scheme"
    value={demo.settings.scheme}
    options={SCHEME_OPTIONS}
    onChange={scheme => demo.update({ scheme })}
    color={COLOR}
  />
  <ChoiceRow
    testID="native-tabs-direction"
    value={demo.settings.direction}
    options={DIRECTION_OPTIONS}
    onChange={direction => demo.update({ direction })}
    color={COLOR}
  />
  <SwitchRow
    testID="native-tabs-tint"
    label="tabBarTintColor"
    value={demo.settings.isTinted}
    onChange={isTinted => demo.update({ isTinted })}
    color={COLOR}
  />
</Recipe>
