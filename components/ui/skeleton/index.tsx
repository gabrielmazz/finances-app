import React from 'react';
import {
  Animated,
  Easing,
  type DimensionValue,
  type LayoutChangeEvent,
  View,
  type ViewProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAppTheme } from '@/contexts/ThemeContext';

type SkeletonVariant = 'rounded' | 'sharp' | 'circular';

type SkeletonProps = ViewProps & {
  className?: string;
  variant?: SkeletonVariant;
};

type SkeletonTextProps = Omit<SkeletonProps, 'children' | 'onLayout' | 'variant'> & {
  _lines?: number;
  gap?: number;
  containerClassName?: string;
  lineWidths?: DimensionValue[];
};

const VARIANT_RADIUS: Record<SkeletonVariant, number> = {
  rounded: 999,
  sharp: 8,
  circular: 9999,
};

const DEFAULT_TEXT_LINE_WIDTHS: DimensionValue[] = ['100%', '92%', '78%', '88%'];

const Skeleton = React.forwardRef<React.ComponentRef<typeof View>, SkeletonProps>(
  function Skeleton(
    { className, variant = 'rounded', style, onLayout, ...props },
    ref
  ) {
    const { isDarkMode } = useAppTheme();
    const shimmerProgress = React.useRef(new Animated.Value(0)).current;
    const [layoutWidth, setLayoutWidth] = React.useState(0);

    React.useEffect(() => {
      if (layoutWidth <= 0) {
        return;
      }

      shimmerProgress.setValue(0);

      const shimmerLoop = Animated.loop(
        Animated.timing(shimmerProgress, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      );

      shimmerLoop.start();

      return () => {
        shimmerLoop.stop();
      };
    }, [layoutWidth, shimmerProgress]);

    const handleLayout = React.useCallback(
      (event: LayoutChangeEvent) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0 && nextWidth !== layoutWidth) {
          setLayoutWidth(nextWidth);
        }

        onLayout?.(event);
      },
      [layoutWidth, onLayout]
    );

    const shimmerWidth = Math.max(layoutWidth * 0.55, 48);
    const translateX = shimmerProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, layoutWidth + shimmerWidth],
    });

    return (
      <View
        ref={ref}
        className={`overflow-hidden ${className ?? ''}`}
        style={[
          {
            borderRadius: VARIANT_RADIUS[variant],
            backgroundColor: isDarkMode ? '#1E293B' : '#E2E8F0',
          },
          style,
        ]}
        onLayout={handleLayout}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...props}
      >
        {layoutWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: -shimmerWidth,
              width: shimmerWidth,
              transform: [{ translateX }],
            }}
          >
            <LinearGradient
              colors={[
                'transparent',
                isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.42)',
                'transparent',
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        ) : null}
      </View>
    );
  }
);

Skeleton.displayName = 'Skeleton';

function SkeletonText({
  _lines = 3,
  gap = 8,
  className,
  containerClassName,
  lineWidths,
  style,
  ...props
}: SkeletonTextProps) {
  if (_lines <= 0) {
    return null;
  }

  return (
    <View
      className={containerClassName}
      style={[{ rowGap: gap }, style]}
    >
      {Array.from({ length: _lines }).map((_, index) => (
        <Skeleton
          key={`skeleton-text-line-${index}`}
          className={className}
          style={{ width: lineWidths?.[index] ?? DEFAULT_TEXT_LINE_WIDTHS[index] ?? '100%' }}
          {...props}
        />
      ))}
    </View>
  );
}

export { Skeleton, SkeletonText };
