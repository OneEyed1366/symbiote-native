export type ILayoutAnimationType =
  'spring' | 'linear' | 'easeInEaseOut' | 'easeIn' | 'easeOut' | 'keyboard';

export type ILayoutAnimationProperty =
  'opacity' | 'scaleX' | 'scaleY' | 'scaleXY';

export type ILayoutAnimationTypes = Readonly<
  Record<ILayoutAnimationType, ILayoutAnimationType>
>;
export type ILayoutAnimationProperties = Readonly<
  Record<ILayoutAnimationProperty, ILayoutAnimationProperty>
>;

export type ILayoutAnimationAnim = {
  duration?: number;
  delay?: number;
  springDamping?: number;
  initialVelocity?: number;
  type?: ILayoutAnimationType;
  property?: ILayoutAnimationProperty;
};

export type ILayoutAnimationConfig = {
  duration?: number;
  create?: ILayoutAnimationAnim;
  update?: ILayoutAnimationAnim;
  delete?: ILayoutAnimationAnim;
};
