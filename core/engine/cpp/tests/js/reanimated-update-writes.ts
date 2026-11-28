// Stands in for the UI side's prop writer inside the tester, as vitest does with a mock
// It keeps the latest value per key only, since a log of writes would grow with every visit

export const latestWrite: { views: number; props: Record<string, unknown> } = {
  views: 0,
  props: {},
};

export const updateProps = (
  viewDescriptors: { value?: readonly unknown[] },
  updates: Record<string, unknown>,
): void => {
  latestWrite.views = viewDescriptors.value?.length ?? 0;
  Object.assign(latestWrite.props, updates);
};
