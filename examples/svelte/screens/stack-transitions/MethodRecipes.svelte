<script lang="ts">
  import ActionButton from '../../components/ActionButton.svelte';
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import { POP_COUNTS } from './probe';
  import { useProbe } from './use-probe.svelte';

  const COLOR = LINE_COLOR.routing;
  const pushRecipe = recipeById('stack-push');
  const popRecipe = recipeById('stack-pop');
  const popToRecipe = recipeById('stack-pop-to');
  const resetRecipe = recipeById('stack-reset');
  const canGoBackRecipe = recipeById('stack-can-go-back');

  // The stack methods of the handle, the readout above shows what each call did to the depth
  const stack = useProbe();
</script>

<Recipe recipe={pushRecipe}>
  <ActionButton
    testID="stack-push"
    title="push(probe)"
    onPress={stack.actions.pushProbe}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={popRecipe}>
  <LabeledChoice
    testID="stack-pop-count"
    label="pop(count)"
    value={stack.panel.popCount}
    options={POP_COUNTS}
    onChange={popCount => stack.update({ popCount })}
    color={COLOR}
  />
  <ActionButton
    testID="stack-pop"
    title="pop(count)"
    onPress={stack.actions.pop}
    color={COLOR}
  />
  <ActionButton
    testID="stack-pop-to-top"
    title="popToTop()"
    onPress={stack.actions.popToTop}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={popToRecipe}>
  <ActionButton
    testID="stack-pop-to"
    title="popTo(first probe's parent)"
    onPress={stack.actions.popToAnchor}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={resetRecipe}>
  <ActionButton
    testID="stack-reset"
    title="reset(menu + one probe)"
    onPress={stack.actions.reset}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={canGoBackRecipe}>
  <text testID="stack-can-go-back" class="list-row-text">
    {`canGoBack() is ${stack.canGoBack}`}
  </text>
</Recipe>
