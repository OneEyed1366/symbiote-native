// The test drives the real `Stack` through the handle its mounted home screen publishes here

type IStackActions = { push(name: string): void; pop(): void };

export const home: { navigation?: { readonly current: IStackActions } } = {};

export const stackActions = (): IStackActions => {
  if (home.navigation === undefined) {
    throw new Error(
      'the home screen never mounted, so there is no Stack handle',
    );
  }
  return home.navigation.current;
};
