import type { ITourRouteName } from '../navigation-lines';

export type IRecipePlatform = 'all' | 'ios' | 'android' | 'ios26' | 'ios27';

// One question people type into a search box, the option that answers it and what to look for
export type INavigationRecipe = {
  id: string;
  route: ITourRouteName;
  question: string;
  option: string;
  platform: IRecipePlatform;
  // The visible effect of the live control, also the operator's device check
  expected: string;
  caveat?: string;
};
