<script lang="ts">
  import { useRoute } from '@symbiote-native/navigation/svelte';
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { isParamsRecord, readText } from '../read-params';
  import { useRouteSettings } from '../use-route-settings.svelte';
  import {
    ITEM_KINDS,
    readHeaderOptionsSettings,
  } from './header-options-settings';

  const COLOR = LINE_COLOR.presentation;
  const largeTitleRecipe = recipeById('header-options-large-title');
  const barItemsRecipe = recipeById('header-options-bar-items');

  // What the last bar button or menu entry reported, kept in the route params by the resolver
  const header = useRouteSettings(readHeaderOptionsSettings);
  const route = useRoute();
  const lastAction = $derived(
    isParamsRecord(route.current.params)
      ? readText(route.current.params, 'lastHeaderAction', '')
      : '',
  );
</script>

<Recipe recipe={largeTitleRecipe}>
  <SwitchRow
    testID="header-large-title"
    label="headerLargeTitle"
    value={header.settings.isLargeTitle}
    onChange={isLargeTitle => header.update({ isLargeTitle })}
    color={COLOR}
  />
  <SwitchRow
    testID="header-translucent"
    label="headerTranslucent"
    value={header.settings.isTranslucent}
    onChange={isTranslucent => header.update({ isTranslucent })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={barItemsRecipe}>
  <LabeledChoice
    testID="header-left-items"
    label="headerLeftBarButtonItems"
    value={header.settings.leftItems}
    options={ITEM_KINDS}
    onChange={leftItems => header.update({ leftItems })}
    color={COLOR}
  />
  <LabeledChoice
    testID="header-right-items"
    label="headerRightBarButtonItems"
    value={header.settings.rightItems}
    options={ITEM_KINDS}
    onChange={rightItems => header.update({ rightItems })}
    color={COLOR}
  />
  <SwitchRow
    testID="header-spaced"
    label="spacing item and a second button"
    value={header.settings.isSpaced}
    onChange={isSpaced => header.update({ isSpaced })}
    color={COLOR}
  />
  <text testID="header-last-action" class="info-text">
    {`last header action: ${lastAction || 'none yet, tap a bar button or menu item'}`}
  </text>
</Recipe>
