import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

type IScreenHeroProps = {
  route: ITourRouteName;
  title: string;
  body: string;
};

// Line tag and intro card every demo screen leads with, tinted by the screen's own line
export function ScreenHero({ route, title, body }: IScreenHeroProps) {
  const info = ROUTE_LINE_INFO[route];
  return (
    <>
      <view className={`line-tag line-tag-${info.line}`}>
        <text className="line-tag-text">{`${info.code} · ${info.label}`}</text>
      </view>
      <view className="hero-card">
        <view
          className="hero-badge"
          style={{ backgroundColor: LINE_COLOR[info.line] }}
        >
          <text className="hero-badge-text">{info.code}</text>
        </view>
        <view className="hero-copy">
          <text className="hero-title">{title}</text>
          <text className="hero-body">{body}</text>
        </view>
      </view>
    </>
  );
}
