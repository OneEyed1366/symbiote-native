import { For, Show } from 'solid-js';
import { Recipe } from '../../components/Recipe';
import { ScreenHero } from '../../components/ScreenHero';
import { recipeById } from '../../navigation-recipes';
import { ROUTE_NAME } from '../../routes';
import { BarRecipes } from './BarRecipes';
import { useNativeTabsDemo } from './native-tabs-demo';
import { TabRecipes } from './TabRecipes';

const eventsRecipe = recipeById('native-tabs-events');

// The control panel tab, the other tabs are what its switches act on
export function ConfigTab() {
  const { log } = useNativeTabsDemo();
  return (
    <scroll-view testID="native-tabs-config" class="screen">
      <view class="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.NativeTabs}
          title="Native tabs"
          body="The platform tab bar, one native screen per tab. Change a switch here and watch the bar."
        />
        <BarRecipes />
        <TabRecipes />
        <Recipe recipe={eventsRecipe}>
          <Show
            when={log().length > 0}
            fallback={<text class="info-text">No events yet, switch a tab</text>}
          >
            <For each={log()}>
              {(line, index) => (
                <text testID={`native-tabs-log-${index()}`} class="list-row-text">
                  {line}
                </text>
              )}
            </For>
          </Show>
        </Recipe>
      </view>
    </scroll-view>
  );
}
