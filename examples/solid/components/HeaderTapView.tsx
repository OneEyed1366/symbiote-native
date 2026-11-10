type IHeaderTapViewProps = {
  testID: string;
  label: string;
  onPress: () => void;
};

// A small tappable pill for the custom views of a native header
export function HeaderTapView(props: IHeaderTapViewProps) {
  return (
    <pressable
      testID={props.testID}
      onPress={() => props.onPress()}
      class="header-view"
    >
      <text class="header-view-text">{props.label}</text>
    </pressable>
  );
}
