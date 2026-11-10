<script lang="ts">
  import {
    deserializeNavigatorState,
    serializeNavigatorState,
  } from '@symbiote-native/navigation';
  import type { INavigatorState } from '@symbiote-native/navigation';
  import {
    useNavigationState,
    useStackNavigation,
  } from '@symbiote-native/navigation/svelte';
  import type { ITextInputChangeEvent } from '@symbiote-native/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import LabeledChoice from '../../components/LabeledChoice.svelte';
  import Recipe from '../../components/Recipe.svelte';
  import { LINE_COLOR } from '../../navigation-lines';
  import { recipeById } from '../../navigation-recipes';
  import { ROUTE_NAME } from '../../routes';
  import {
    breakSnapshot,
    PRESET_CHOICES,
    presetState,
  } from './persistence-presets';
  import { createSnapshot, snapshotStore } from './use-snapshot';

  const setSnapshot = snapshotStore.set;

  const COLOR = LINE_COLOR.routing;
  const EMPTY_TEXT = 'tap Serialize to capture the current route stack as JSON';
  const JSON_INDENT = 2;
  const saveRecipe = recipeById('persist-save');
  const restoreRecipe = recipeById('persist-restore');
  const invalidRecipe = recipeById('persist-invalid');
  const resetRecipe = recipeById('persist-reset');

  function errorText(error: unknown): string {
    return error instanceof Error ? error.message : 'restore failed';
  }

  const navigation = useStackNavigation();
  // Not named `state`: svelte2tsx would read every `$state` rune below as a store of that name
  const navigatorState = useNavigationState<INavigatorState>(
    current => current,
  );
  const snapshot = createSnapshot();
  let error = $state<string | undefined>(undefined);
  let preset = $state<(typeof PRESET_CHOICES)[number]>('details');

  function serialize() {
    error = undefined;
    setSnapshot(
      JSON.stringify(
        serializeNavigatorState(navigatorState.current),
        null,
        JSON_INDENT,
      ),
    );
  }

  function restore() {
    const current = snapshot.current;
    if (current === undefined) return;
    try {
      const parsed: unknown = JSON.parse(current);
      navigation.current.reset(deserializeNavigatorState(parsed));
      error = undefined;
    } catch (thrown) {
      error = errorText(thrown);
    }
  }
</script>

<text testID="persist-depth" class="info-text">
  {`current stack depth: ${navigatorState.current.routes.length}`}
</text>
<ActionButton
  testID="persist-push"
  title="Push Details to change the depth"
  onPress={() => navigation.current.push(ROUTE_NAME.Details, { id: '1' })}
  color={COLOR}
/>
<Recipe recipe={saveRecipe}>
  <ActionButton
    testID="persist-serialize"
    title="Serialize current stack"
    onPress={serialize}
    color={COLOR}
  />
  <text-input
    testID="persist-snapshot"
    multiline
    value={snapshot.current ?? ''}
    onValueChange={(event: ITextInputChangeEvent) => setSnapshot(event.text)}
    placeholder={EMPTY_TEXT}
    placeholderTextColor="#41506a"
    class="text-input snapshot-input"
  ></text-input>
</Recipe>
<Recipe recipe={restoreRecipe}>
  <ActionButton
    testID="persist-restore"
    title="Restore serialized snapshot"
    onPress={restore}
    color={COLOR}
  />
</Recipe>
<Recipe recipe={invalidRecipe}>
  <ActionButton
    testID="persist-break"
    title="Break the snapshot"
    onPress={() => setSnapshot(breakSnapshot())}
    color={COLOR}
  />
  {#if error !== undefined}
    <text testID="persist-error" class="info-text">{`error: ${error}`}</text>
  {/if}
</Recipe>
<Recipe recipe={resetRecipe}>
  <LabeledChoice
    testID="persist-preset"
    label="stack to reset to"
    value={preset}
    options={PRESET_CHOICES}
    onChange={choice => (preset = choice)}
    color={COLOR}
  />
  <ActionButton
    testID="persist-reset"
    title="reset(state)"
    onPress={() => navigation.current.reset(presetState(preset))}
    color={COLOR}
  />
</Recipe>
