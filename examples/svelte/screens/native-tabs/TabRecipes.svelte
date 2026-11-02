<script lang="ts">
  import { useTabNavigation } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import ChoiceRow from '../../components/ChoiceRow.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import SwitchRow from '../../components/SwitchRow.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { BADGE_OPTIONS, useNativeTabsDemo } from './native-tabs-demo.svelte';

  const COLOR = LINE_COLOR.structure;
  const badgeRecipe = recipeById('native-tabs-badge');
  const preventRecipe = recipeById('native-tabs-prevent');
  const retapRecipe = recipeById('native-tabs-retap');
  const searchRecipe = recipeById('native-tabs-search');
  const iconsRecipe = recipeById('native-tabs-icons');

  // Recipes for the options of one tab, each tab is one native screen of the bar
  const demo = useNativeTabsDemo();
  const navigation = useTabNavigation();
</script>

<Recipe recipe={badgeRecipe}>
  <ChoiceRow
    testID="native-tabs-badge"
    value={demo.settings.badge}
    options={BADGE_OPTIONS}
    onChange={badge => demo.update({ badge })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={preventRecipe}>
  <SwitchRow
    testID="native-tabs-locked"
    label="preventNativeSelection on Locked"
    value={demo.settings.isLocked}
    onChange={isLocked => demo.update({ isLocked })}
    color={COLOR}
  />
  <ActionButton
    testID="native-tabs-open-locked"
    title="Open Locked with jumpTo"
    onPress={() => navigation.current.jumpTo('Locked')}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={retapRecipe}>
  <SwitchRow
    testID="native-tabs-scroll-to-top"
    label="scrollToTop on Feed"
    value={demo.settings.isScrollToTop}
    onChange={isScrollToTop => demo.update({ isScrollToTop })}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={searchRecipe}>
  <text class="info-text">
    The Search tab at the end of the bar carries the role.
  </text>
</Recipe>
<Recipe recipe={iconsRecipe}>
  <text class="info-text">
    Config, Feed, Inbox, Locked and Search each set an SF Symbol and a filled
    one for the selected state.
  </text>
</Recipe>
