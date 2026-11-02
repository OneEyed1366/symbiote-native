<!-- One recipe per question: a one-time mount value against the focus hooks and the route stack -->
<script lang="ts">
  import {
    useFocusEffect,
    useIsFocused,
    useNavigationState,
    useStackNavigation,
  } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import Recipe from '../components/Recipe.svelte';
  import ScreenHero from '../components/ScreenHero.svelte';
  import { recipeById } from '../navigation-recipes';
  import { LINE_COLOR } from '../navigation-lines';
  import { ROUTE_NAME } from '../routes';

  const effectOnce = recipeById('hooks-effect-once');
  const isFocusedRecipe = recipeById('hooks-is-focused');
  const stateRecipe = recipeById('hooks-navigation-state');
  const paramsRecipe = recipeById('hooks-route-params');
  const COLOR = LINE_COLOR.introspection;

  const navigation = useStackNavigation();
  const mountedAt = new Date().toLocaleTimeString();
  let focusCount = $state(0);
  let lastBlurAt = $state<number | undefined>(undefined);
  const isFocused = useIsFocused();
  const routeNames = useNavigationState(state =>
    state.routes.map(route => route.name),
  );

  useFocusEffect(() => {
    focusCount += 1;
    return () => {
      lastBlurAt = Date.now();
    };
  });
</script>

<safe-area-view class="screen">
  <scroll-view testID="hooks-scroll" class="screen">
    <view class="scroll-content">
      <ScreenHero
        route={ROUTE_NAME.HooksDemo}
        title="Hooks"
        body="Focus and state hooks of the navigator, each one answering a question people search for."
      />
      <Recipe recipe={effectOnce}>
        <text testID="hooks-mounted-at" class="info-text">
          {`mounted once, at ${mountedAt}`}
        </text>
        <text testID="hooks-focus-count" class="info-text">
          {`useFocusEffect ran: ${focusCount}`}
        </text>
        <text class="info-text">
          {lastBlurAt === undefined
            ? 'not blurred yet'
            : `last blurred at ${lastBlurAt}`}
        </text>
        <ActionButton
          testID="hooks-push-details"
          title="Push Details"
          onPress={() => navigation.current.push(ROUTE_NAME.Details)}
          color={COLOR}
        />
      </Recipe>
      <Recipe recipe={isFocusedRecipe}>
        <text testID="hooks-is-focused" class="info-text">
          {`useIsFocused(): ${isFocused.current}`}
        </text>
      </Recipe>
      <Recipe recipe={stateRecipe}>
        {#each routeNames.current as name, index (`${name}-${index}`)}
          <text class="list-row-text">{`${index}. ${name}`}</text>
        {/each}
        <ActionButton
          testID="hooks-push-self"
          title="Push this screen again"
          onPress={() => navigation.current.push(ROUTE_NAME.HooksDemo)}
          color={COLOR}
        />
      </Recipe>
      <Recipe recipe={paramsRecipe}>
        <ActionButton
          testID="hooks-push-details-params"
          title="Push Details with params"
          onPress={() =>
            navigation.current.push(ROUTE_NAME.Details, { openedFrom: 'hooks' })}
          color={COLOR}
        />
      </Recipe>
    </view>
  </scroll-view>
</safe-area-view>
