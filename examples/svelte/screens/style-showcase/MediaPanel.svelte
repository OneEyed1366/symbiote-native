<view class="sc-panel">
  <text class="sc-panel-title">9 · @media — evaluated at runtime</text>
  <text class="sc-tile-label">WINDOW WIDTH AND ORIENTATION</text>
  <view class="sc-media-tile" testID="sc-media-tile">
    <text class="sc-media-text">
      green from 600 wide · amber border in landscape
    </text>
  </view>
  <text class="sc-tile-caption">
    Rotate the device or resize the window: the tile repaints with no re-render.
    Dark mode and the reduced-motion setting flip the same way. Query the state
    from JS with matchMedia.
  </text>
</view>
