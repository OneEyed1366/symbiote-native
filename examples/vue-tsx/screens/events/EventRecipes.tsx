import { defineComponent } from 'vue';
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import { ActionButton } from '../../components/ActionButton';
import { Recipe } from '../../components/Recipe';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';

const COLOR = LINE_COLOR.introspection;
const focusRecipe = recipeById('events-focus-blur');
const stateRecipe = recipeById('events-state');
const transitionRecipe = recipeById('events-transition');
const headerRecipe = recipeById('events-header');
const removeRecipe = recipeById('events-before-remove');

// One recipe per event, the buttons cause the event and the live log above shows it
export const EventRecipes = defineComponent(
  () => {
    const navigation = useStackNavigation();
    const pushDetails = () => navigation.value.push(ROUTE_NAME.Details);
    return () => (
      <>
        <Recipe recipe={focusRecipe}>
          <ActionButton
            testID="events-push-focus"
            title="Push Details"
            onPress={pushDetails}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={stateRecipe}>
          <ActionButton
            testID="events-set-params"
            title="setParams"
            onPress={() => navigation.value.setParams({ pressedAt: Date.now() })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={transitionRecipe}>
          <ActionButton
            testID="events-push-transition"
            title="Push Details"
            onPress={pushDetails}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={headerRecipe}>
          <ActionButton
            testID="events-push-header"
            title="Push Details"
            onPress={pushDetails}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={removeRecipe}>
          <text class="info-text">
            Go back with the header button, return here and read the log.
          </text>
        </Recipe>
      </>
    );
  },
  { name: 'EventRecipes' },
);
