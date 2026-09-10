import { Children, type ReactNode } from 'react';

type IChildrenReportProps = { children: ReactNode };

function ChildrenReport({ children }: IChildrenReportProps) {
  const count = Children.count(children);
  let forEachHits = 0;
  Children.forEach(children, () => {
    forEachHits += 1;
  });
  const wrapped = Children.map(children, (child, index) => (
    <view key={index} className="row-tight">
      <text className="list-row-text">{`${index + 1}.`}</text>
      {child}
    </view>
  ));
  const flatLength = Children.toArray(children).length;

  return (
    <view className="section-tight">
      <text testID="children-count" className="info-text">
        {`Children.count=${count} · Children.forEach visited=${forEachHits} · Children.toArray length=${flatLength}`}
      </text>
      {wrapped}
    </view>
  );
}

type ISingleChildFrameProps = { children: ReactNode };

function SingleChildFrame({ children }: ISingleChildFrameProps) {
  // Children.only: asserts exactly one child and returns it unwrapped — throws given zero or
  // more than one, unlike Children.map's tolerance for any shape.
  const onlyChild = Children.only(children);
  return <view className="ref-box">{onlyChild}</view>;
}

export function ChildrenApiDemo() {
  return (
    <view className="section-nested">
      <text className="section-label">
        Children.map · Children.forEach · Children.count · Children.only ·
        Children.toArray
      </text>
      <ChildrenReport>
        <text className="list-row-text">first</text>
        <text className="list-row-text">second</text>
        <text className="list-row-text">third</text>
      </ChildrenReport>
      <SingleChildFrame>
        <text testID="children-only-result" className="ref-box-text">
          Children.only's single child
        </text>
      </SingleChildFrame>
    </view>
  );
}
