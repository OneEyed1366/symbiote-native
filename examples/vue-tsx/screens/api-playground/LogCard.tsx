type ILogCardProps = { entries: readonly string[]; emptyText: string };

export function LogCard(props: ILogCardProps) {
  return (
    <view class="log-card">
      {props.entries.length === 0 ? (
        <text class="list-row-text">{props.emptyText}</text>
      ) : (
        props.entries.map((entry, index) => (
          <text key={index} class="list-row-text">
            {entry}
          </text>
        ))
      )}
    </view>
  );
}
