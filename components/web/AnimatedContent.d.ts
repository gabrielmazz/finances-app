import * as React from 'react';

export interface AnimatedContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  container?: Element | string | null;
  distance?: number;
  direction?: 'vertical' | 'horizontal' | string;
  reverse?: boolean;
  disappearReverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  disappearScale?: number;
  threshold?: number;
  delay?: number;
  disappearAfter?: number;
  disappearDuration?: number;
  disappearEase?: string;
  trigger?: 'scroll' | 'mount';
  visible?: boolean;
  onComplete?: () => void;
  onDisappearanceComplete?: () => void;
}

declare const AnimatedContent: React.ComponentType<AnimatedContentProps>;

export default AnimatedContent;
