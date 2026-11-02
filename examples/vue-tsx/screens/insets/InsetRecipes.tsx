import { defineComponent } from 'vue';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { useRouteSettings } from '../use-route-settings';
import { LabeledChoice } from '../../components/LabeledChoice';
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
export const InsetRecipes = defineComponent(
  () => {
    const { settings, update } = useRouteSettings(readInsetsSettings);
    return () => (
      <>
        <Recipe recipe={edgesRecipe}>
          <LabeledChoice
            testID="insets-edge-top"
            label="safeAreaEdges.top"
            value={settings.value.topEdge}
            options={EDGE_MODES}
            onChange={topEdge => update({ topEdge })}
            color={COLOR}
          />
          <LabeledChoice
            testID="insets-edge-right"
            label="safeAreaEdges.right"
            value={settings.value.rightEdge}
            options={EDGE_MODES}
            onChange={rightEdge => update({ rightEdge })}
            color={COLOR}
          />
          <LabeledChoice
            testID="insets-edge-bottom"
            label="safeAreaEdges.bottom"
            value={settings.value.bottomEdge}
            options={EDGE_MODES}
            onChange={bottomEdge => update({ bottomEdge })}
            color={COLOR}
          />
          <LabeledChoice
            testID="insets-edge-left"
            label="safeAreaEdges.left"
            value={settings.value.leftEdge}
            options={EDGE_MODES}
            onChange={leftEdge => update({ leftEdge })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={scrollEdgeRecipe}>
          <LabeledChoice
            testID="insets-effect-top"
            label="scrollEdgeEffects.top"
            value={settings.value.topEffect}
            options={SCROLL_EDGE_EFFECTS}
            onChange={topEffect => update({ topEffect })}
            color={COLOR}
          />
          <LabeledChoice
            testID="insets-effect-bottom"
            label="scrollEdgeEffects.bottom"
            value={settings.value.bottomEffect}
            options={SCROLL_EDGE_EFFECTS}
            onChange={bottomEffect => update({ bottomEffect })}
            color={COLOR}
          />
          <LabeledChoice
            testID="insets-effect-side"
            label="scrollEdgeEffects.left and right"
            value={settings.value.sideEffect}
            options={SCROLL_EDGE_EFFECTS}
            onChange={sideEffect => update({ sideEffect })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={disableRecipe}>
          <LabeledChoice
            testID="insets-disable"
            label="disable...InsetApplication"
            value={settings.value.disabledInset}
            options={DISABLED_INSETS}
            onChange={disabledInset => update({ disabledInset })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={headerStyleRecipe}>
          <LabeledChoice
            testID="insets-header-style"
            label="headerUserInterfaceStyle"
            value={settings.value.headerStyle}
            options={HEADER_STYLES}
            onChange={headerStyle => update({ headerStyle })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={removedRecipe}>
          <SwitchRow
            testID="insets-removed-colors"
            label="Set the colours and the top inset flag"
            value={settings.value.isLegacyColorSet}
            onChange={isLegacyColorSet => update({ isLegacyColorSet })}
            color={COLOR}
          />
        </Recipe>
      </>
    );
  },
  { name: 'InsetRecipes' },
);
