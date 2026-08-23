import * as React from 'react';

export type CarouselRenderItem<T> = (params: {
  item: T;
  index: number;
}) => React.ReactNode;

export interface CarouselProps<T> {
  items?: T[];
  baseWidth?: number;
  autoplay?: boolean;
  autoplayDelay?: number;
  pauseOnHover?: boolean;
  loop?: boolean;
  round?: boolean;
  renderItem?: CarouselRenderItem<T>;
  className?: string;
}

declare const Carousel: <T>(props: CarouselProps<T>) => React.ReactElement | null;

export default Carousel;
