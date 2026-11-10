<script lang="ts">
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { useRouteSettings } from '../use-route-settings.svelte';
  import {
    DISABLED_INSETS,
    EDGE_MODES,
    HEADER_STYLES,
    readInsetsSettings,
    SCROLL_EDGE_EFFECTS,
  } from './insets-settings';

  const COLOR = LINE_COLOR.presentation;
  const edgesRecipe = recipeById('insets-safe-area-edges');
  const scrollEdgeRecipe = recipeById('insets-scroll-edge');
  const disableRecipe = recipeById('insets-disable-inset');
  const headerStyleRecipe = recipeById('insets-header-style');
  const removedRecipe = recipeById('insets-removed-colors');

  // Where content may sit under the system chrome, and the header look that goes with it
  const insets = useRouteSettings(readInsetsSettings);
</script>

<Recipe recipe={edgesRecipe}>
  <LabeledChoice
    testID="insets-edge-top"
    label="safeAreaEdges.top"
    value={insets.settings.topEdge}
    options={EDGE_MODES}
    onChange={topEdge => insets.update({ topEdge })}
    color={COLOR}
  />
  <LabeledChoice
    testID="insets-edge-right"
    label="safeAreaEdges.right"
    value={insets.settings.rightEdge}
    options={EDGE_MODES}
    onChange={rightEdge => insets.update({ rightEdge })}
    color={COLOR}
  />
  <LabeledChoice
    testID="insets-edge-bottom"
    label="safeAreaEdges.bottom"
    value={insets.settings.bottomEdge}
    options={EDGE_MODES}
    onChange={bottomEdge => insets.update({ bottomEdge })}
    color={COLOR}
  />
  <LabeledChoice
    testID="insets-edge-left"
    label="safeAreaEdges.left"
    value={insets.settings.leftEdge}
    options={EDGE_MODES}
    onChange={leftEdge => insets.update({ leftEdge })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={scrollEdgeRecipe}>
  <LabeledChoice
    testID="insets-effect-top"
    label="scrollEdgeEffects.top"
    value={insets.settings.topEffect}
    options={SCROLL_EDGE_EFFECTS}
    onChange={topEffect => insets.update({ topEffect })}
    color={COLOR}
  />
  <LabeledChoice
    testID="insets-effect-bottom"
    label="scrollEdgeEffects.bottom"
    value={insets.settings.bottomEffect}
    options={SCROLL_EDGE_EFFECTS}
    onChange={bottomEffect => insets.update({ bottomEffect })}
    color={COLOR}
  />
  <LabeledChoice
    testID="insets-effect-side"
    label="scrollEdgeEffects.left and right"
    value={insets.settings.sideEffect}
    options={SCROLL_EDGE_EFFECTS}
    onChange={sideEffect => insets.update({ sideEffect })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={disableRecipe}>
  <LabeledChoice
    testID="insets-disable"
    label="disable...InsetApplication"
    value={insets.settings.disabledInset}
    options={DISABLED_INSETS}
    onChange={disabledInset => insets.update({ disabledInset })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={headerStyleRecipe}>
  <LabeledChoice
    testID="insets-header-style"
    label="headerUserInterfaceStyle"
    value={insets.settings.headerStyle}
    options={HEADER_STYLES}
    onChange={headerStyle => insets.update({ headerStyle })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={removedRecipe}>
  <SwitchRow
    testID="insets-removed-colors"
    label="Set the colours and the top inset flag"
    value={insets.settings.isLegacyColorSet}
    onChange={isLegacyColorSet => insets.update({ isLegacyColorSet })}
    color={COLOR}
  />
</Recipe>
