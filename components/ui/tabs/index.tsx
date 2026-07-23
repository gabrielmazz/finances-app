'use client';

import React from 'react';
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { tva, type VariantProps } from '@gluestack-ui/utils/nativewind-utils';

import { TabsAnimatedIndicator } from './TabsAnimatedIndicator';

type TabsVariant = 'underlined' | 'filled';
type TabsOrientation = 'horizontal' | 'vertical';

type TabLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TabsContextValue = {
  value: string;
  setValue(value: string): void;
  disabled: boolean;
  orientation: TabsOrientation;
  variant: TabsVariant;
  triggerLayouts: Map<string, TabLayout>;
  setTriggerLayout(value: string, layout: TabLayout): void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);
const TabsTriggerContext = React.createContext(false);

const tabsStyle = tva({
  base: 'w-full gap-1',
});

const tabsListStyle = tva({
  base: 'relative z-10 w-full rounded-xl',
  variants: {
    orientation: {
      horizontal: 'flex-row',
      vertical: 'flex-col',
    },
  },
});

const tabsTriggerStyle = tva({
  base: 'relative z-30 min-h-[42px] flex-row items-center justify-center gap-1 px-3 py-1.5',
});

const tabsTriggerTextStyle = tva({
  base: 'font-medium',
});

const tabsContentStyle = tva({
  base: 'h-auto p-2',
});

const tabsContentWrapperStyle = tva({
  base: 'overflow-hidden rounded-lg',
});

const tabsIndicatorStyle = tva({
  base: 'pointer-events-none',
  variants: {
    variant: {
      underlined: 'border-b border-primary-500',
      filled: 'rounded-xl bg-yellow-400 dark:bg-yellow-300',
    },
  },
});

type TabsProps = React.ComponentPropsWithoutRef<typeof View> &
  VariantProps<typeof tabsStyle> & {
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    orientation?: TabsOrientation;
    variant?: TabsVariant;
  };

type TabsListProps = React.ComponentPropsWithoutRef<typeof View>;

type TabsTriggerProps = Omit<React.ComponentPropsWithoutRef<typeof Pressable>, 'children'> & {
  children?: React.ReactNode;
  value: string;
};

type TabsContentProps = React.ComponentPropsWithoutRef<typeof View> & {
  value: string;
  forceMount?: boolean;
};

type TabsContentWrapperProps = React.ComponentPropsWithoutRef<typeof View>;

type TabsTriggerTextProps = React.ComponentPropsWithoutRef<typeof Text>;

type TabsTriggerIconProps = {
  as?: React.ElementType<{
    className?: string;
    color?: string;
    size?: number;
  }>;
  className?: string;
  color?: string;
  size?: number;
};

type TabsIndicatorProps = React.ComponentPropsWithoutRef<typeof View>;

const Tabs = React.forwardRef<React.ComponentRef<typeof View>, TabsProps>(
  (
    {
      className,
      value,
      defaultValue = '',
      onValueChange,
      disabled = false,
      orientation = 'horizontal',
      variant = 'filled',
      ...props
    },
    ref,
  ) => {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const [triggerLayouts, setTriggerLayouts] = React.useState<Map<string, TabLayout>>(
      () => new Map(),
    );
    const selectedValue = value ?? uncontrolledValue;

    const setSelectedValue = React.useCallback(
      (nextValue: string) => {
        if (value === undefined) {
          setUncontrolledValue(nextValue);
        }
        onValueChange?.(nextValue);
      },
      [onValueChange, value],
    );

    const setTriggerLayout = React.useCallback((tabValue: string, layout: TabLayout) => {
      setTriggerLayouts(currentLayouts => {
        const currentLayout = currentLayouts.get(tabValue);
        if (
          currentLayout?.x === layout.x &&
          currentLayout.y === layout.y &&
          currentLayout.width === layout.width &&
          currentLayout.height === layout.height
        ) {
          return currentLayouts;
        }

        const nextLayouts = new Map(currentLayouts);
        nextLayouts.set(tabValue, layout);
        return nextLayouts;
      });
    }, []);

    const contextValue = React.useMemo<TabsContextValue>(
      () => ({
        value: selectedValue,
        setValue: setSelectedValue,
        disabled,
        orientation,
        variant,
        triggerLayouts,
        setTriggerLayout,
      }),
      [
        disabled,
        orientation,
        selectedValue,
        setSelectedValue,
        setTriggerLayout,
        triggerLayouts,
        variant,
      ],
    );

    return (
      <TabsContext.Provider value={contextValue}>
        <View ref={ref} {...props} className={tabsStyle({ class: className })} />
      </TabsContext.Provider>
    );
  },
);

const TabsList = React.forwardRef<React.ComponentRef<typeof View>, TabsListProps>(
  ({ className, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    const orientation = context?.orientation ?? 'horizontal';

    return (
      <View
        ref={ref}
        {...props}
        accessibilityRole={props.accessibilityRole ?? 'tablist'}
        className={tabsListStyle({ orientation, class: className })}
      />
    );
  },
);

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof Pressable>,
  TabsTriggerProps
>(({ children, className, value, disabled, onLayout, onPress, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  const isSelected = context?.value === value;
  const isDisabled = Boolean(disabled || context?.disabled);

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      context?.setTriggerLayout(value, event.nativeEvent.layout);
      onLayout?.(event);
    },
    [context, onLayout, value],
  );

  const handlePress = React.useCallback(
    (event: Parameters<NonNullable<typeof onPress>>[0]) => {
      onPress?.(event);
      if (!isDisabled) {
        context?.setValue(value);
      }
    },
    [context, isDisabled, onPress, value],
  );

  return (
    <Pressable
      ref={ref}
      {...props}
      disabled={isDisabled}
      onLayout={handleLayout}
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      className={tabsTriggerStyle({
        class: `${className ?? ''} ${isDisabled ? 'opacity-40' : ''}`,
      })}
    >
      <TabsTriggerContext.Provider value={Boolean(isSelected)}>
        {children}
      </TabsTriggerContext.Provider>
    </Pressable>
  );
});

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof View>,
  TabsContentProps
>(({ className, value, forceMount = false, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  const isSelected = context?.value === value;

  if (!forceMount && !isSelected) {
    return null;
  }

  return <View ref={ref} {...props} className={tabsContentStyle({ class: className })} />;
});

const TabsContentWrapper = React.forwardRef<
  React.ComponentRef<typeof View>,
  TabsContentWrapperProps
>(({ className, ...props }, ref) => (
  <View ref={ref} {...props} className={tabsContentWrapperStyle({ class: className })} />
));

const TabsTriggerText = React.forwardRef<
  React.ComponentRef<typeof Text>,
  TabsTriggerTextProps
>(({ className, ...props }, ref) => {
  const isSelected = React.useContext(TabsTriggerContext);

  return (
    <Text
      ref={ref}
      {...props}
      className={tabsTriggerTextStyle({
        class: `${isSelected ? 'font-semibold text-slate-900' : 'text-typography-600'} ${className ?? ''}`,
      })}
    />
  );
});

const TabsTriggerIcon = ({ as: Icon, ...props }: TabsTriggerIconProps) => {
  if (!Icon) {
    return null;
  }

  return <Icon {...props} />;
};

const TabsIndicator = React.forwardRef<
  React.ComponentRef<typeof View>,
  TabsIndicatorProps
>(({ className, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  if (!context) {
    return null;
  }

  return (
    <TabsAnimatedIndicator
      ref={ref}
      selectedKey={context.value}
      orientation={context.orientation}
      triggerLayouts={context.triggerLayouts}
      className={tabsIndicatorStyle({ variant: context.variant, class: className })}
      {...props}
    />
  );
});

Tabs.displayName = 'Tabs';
TabsList.displayName = 'TabsList';
TabsTrigger.displayName = 'TabsTrigger';
TabsContent.displayName = 'TabsContent';
TabsContentWrapper.displayName = 'TabsContentWrapper';
TabsTriggerText.displayName = 'TabsTriggerText';
TabsTriggerIcon.displayName = 'TabsTriggerIcon';
TabsIndicator.displayName = 'TabsIndicator';

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsContentWrapper,
  TabsTriggerText,
  TabsTriggerIcon,
  TabsIndicator,
};
