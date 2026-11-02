<script lang="ts">
  import ActionButton from '../../components/ActionButton.svelte';
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import { recipeById } from '../../navigation-recipes';
  import { LINE_COLOR } from '../../navigation-lines';
  import {
    ANIMATIONS,
    DURATIONS,
    PRESENTATIONS,
    REPLACE_ANIMATIONS,
    timedPanelOf,
  } from './probe';
  import { useProbe } from './use-probe.svelte';

  const COLOR = LINE_COLOR.routing;
  const presentationRecipe = recipeById('stack-presentation');
  const animationRecipe = recipeById('stack-animation');
  const durationRecipe = recipeById('stack-duration');
  const replaceRecipe = recipeById('stack-replace-animation');

  // Each choice is for the next probe, the probe keeps it as its own entry transition
  const stack = useProbe();
  // iOS times only some pairs, so the push of the duration recipe picks one of them
  const timed = $derived(timedPanelOf(stack.panel));
</script>

<Recipe recipe={presentationRecipe}>
  <LabeledChoice
    testID="stack-presentation"
    label="stackPresentation"
    value={stack.panel.nextPresentation}
    options={PRESENTATIONS}
    onChange={nextPresentation => stack.update({ nextPresentation })}
    color={COLOR}
  />
  <ActionButton
    testID="stack-push-presentation"
    title="Push a probe"
    onPress={stack.actions.pushProbe}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={animationRecipe}>
  <LabeledChoice
    testID="stack-animation"
    label="stackAnimation"
    value={stack.panel.nextAnimation}
    options={ANIMATIONS}
    onChange={nextAnimation => stack.update({ nextAnimation })}
    color={COLOR}
  />
  <ActionButton
    testID="stack-push-animation"
    title="Push a probe"
    onPress={stack.actions.pushProbe}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={durationRecipe}>
  <LabeledChoice
    testID="stack-duration"
    label="transitionDuration (ms)"
    value={stack.panel.nextDuration}
    options={DURATIONS}
    onChange={nextDuration => stack.update({ nextDuration })}
    color={COLOR}
  />
  <text class="info-text">
    {`Pushes as ${timed.nextPresentation} with ${timed.nextAnimation}, the pair iOS can time`}
  </text>
  <ActionButton
    testID="stack-push-duration"
    title="Push a timed probe"
    onPress={stack.actions.pushTimedProbe}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={replaceRecipe}>
  <LabeledChoice
    testID="stack-replace-animation"
    label="replaceAnimation"
    value={stack.panel.nextReplaceAnimation}
    options={REPLACE_ANIMATIONS}
    onChange={nextReplaceAnimation => stack.update({ nextReplaceAnimation })}
    color={COLOR}
  />
  {#if stack.probe.isProbe}
    <ActionButton
      testID="stack-replace"
      title="Replace this probe"
      onPress={stack.actions.replaceWithProbe}
      color={COLOR}
    />
  {:else}
    <text class="info-text">Push a probe first, replace swaps the top one</text>
  {/if}
</Recipe>
