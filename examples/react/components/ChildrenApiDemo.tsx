import { Children, type ReactNode } from 'react';
import { Text, View } from '@symbiote-native/react';

type IChildrenReportProps = { children: ReactNode };

function ChildrenReport({ children }: IChildrenReportProps) {
  const count = Children.count(children);
  let forEachHits = 0;
  Children.forEach(children, () => {
    forEachHits += 1;
  });
  const wrapped = Children.map(children, (child, index) => (
    <View key={index} className="row-tight">
      <Text className="list-row-text">{`${index + 1}.`}</Text>
      {child}
    </View>
  ));
  const flatLength = Children.toArray(children).length;

  return (
    <View className="section-tight">
      <Text testID="children-count" className="info-text">
        {`Children.count=${count} · Children.forEach visited=${forEachHits} · Children.toArray length=${flatLength}`}
      </Text>
      {wrapped}
    </View>
  );
}

type ISingleChildFrameProps = { children: ReactNode };

function SingleChildFrame({ children }: ISingleChildFrameProps) {
  // Children.only: asserts exactly one child and returns it unwrapped — throws given zero or
  // more than one, unlike Children.map's tolerance for any shape.
  const onlyChild = Children.only(children);
  return <View className="ref-box">{onlyChild}</View>;
}

export function ChildrenApiDemo() {
  return (
    <View className="section-nested">
      <Text className="section-label">
        Children.map · Children.forEach · Children.count · Children.only ·
        Children.toArray
      </Text>
      <ChildrenReport>
        <Text className="list-row-text">first</Text>
        <Text className="list-row-text">second</Text>
        <Text className="list-row-text">third</Text>
      </ChildrenReport>
      <SingleChildFrame>
        <Text testID="children-only-result" className="ref-box-text">
          Children.only's single child
        </Text>
      </SingleChildFrame>
    </View>
  );
}
