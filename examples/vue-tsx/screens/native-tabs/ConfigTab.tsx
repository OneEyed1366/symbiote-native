import { defineComponent, Fragment } from 'vue';
import { Recipe } from '../../components/Recipe';
import { ScreenHero } from '../../components/ScreenHero';
import { recipeById } from '../../navigation-recipes';
import { ROUTE_NAME } from '../../routes';
import { BarRecipes } from './BarRecipes';
import { useNativeTabsDemo } from './native-tabs-demo';
import { TabRecipes } from './TabRecipes';

const eventsRecipe = recipeById('native-tabs-events');

// The control panel tab, the other tabs are what its switches act on
export const ConfigTab = defineComponent(
  () => {
    const { log } = useNativeTabsDemo();
    return () => (
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
            {log.value.length === 0 ? (
              <text class="info-text">No events yet, switch a tab</text>
            ) : (
              log.value.map((line, index) => (
                <Fragment key={`${index}-${line}`}>
                  <text testID={`native-tabs-log-${index}`} class="list-row-text">
                    {line}
                  </text>
                </Fragment>
              ))
            )}
          </Recipe>
        </view>
      </scroll-view>
    );
  },
  { name: 'ConfigTab' },
);
