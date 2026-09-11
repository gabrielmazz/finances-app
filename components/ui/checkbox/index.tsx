'use client';
import React from 'react';
import { createCheckbox } from '@gluestack-ui/core/checkbox/creator';
import { View, Pressable, Text, Platform } from 'react-native';
import type { TextProps, ViewProps } from 'react-native';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import {
  PrimitiveIcon,
  IPrimitiveIcon,
  UIIcon,
} from '@gluestack-ui/core/icon/creator';
import {
  withStyleContext,
  useStyleContext,
} from '@gluestack-ui/utils/nativewind-utils';
import { cssInterop } from 'nativewind';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';

const IndicatorWrapper = React.forwardRef<
  React.ComponentRef<typeof View>,
  ViewProps
>(function IndicatorWrapper({ ...props }, ref) {
  return <View {...props} ref={ref} />;
});

const LabelWrapper = React.forwardRef<
  React.ComponentRef<typeof Text>,
  TextProps
>(function LabelWrapper({ ...props }, ref) {
  return <Text {...props} ref={ref} />;
});

const IconWrapper = React.forwardRef<
  React.ComponentRef<typeof PrimitiveIcon>,
  IPrimitiveIcon
>(function IconWrapper({ ...props }, ref) {
  return <UIIcon {...props} ref={ref} />;
});

const SCOPE = 'CHECKBOX';
const UICheckbox = createCheckbox({
  // @ts-expect-error : internal implementation for r-19/react-native-web
  Root:
    Platform.OS === 'web'
      ? withStyleContext(View, SCOPE)
      : withStyleContext(Pressable, SCOPE),
  Group: View,
  Icon: IconWrapper,
  Label: LabelWrapper,
  Indicator: IndicatorWrapper,
});

cssInterop(PrimitiveIcon, {
  className: {
    target: 'style',
    nativeStyleToProp: {
      height: true,
      width: true,
      fill: true,
      color: 'classNameColor',
      stroke: true,
    },
  },
});

const checkboxStyle = tva({
  base: 'group/checkbox flex-row items-center justify-start web:cursor-pointer data-[disabled=true]:cursor-not-allowed',
  variants: {
    size: {
      lg: 'gap-2',
      md: 'gap-2',
      sm: 'gap-1.5',
    },
  },
});

const checkboxIndicatorStyle = tva({
  base: 'items-center justify-center rounded border-outline-400 bg-transparent data-[checked=true]:border-lumus-accent data-[checked=true]:bg-lumus-accent data-[active=true]:data-[checked=true]:border-lumus-accent-pressed data-[active=true]:data-[checked=true]:bg-lumus-accent-pressed data-[hover=true]:border-outline-500 data-[focus-visible=true]:web:outline-none data-[focus-visible=true]:web:ring-2 data-[focus-visible=true]:web:ring-lumus-focus data-[focus-visible=true]:web:ring-offset-2 data-[invalid=true]:border-error-700 data-[disabled=true]:opacity-40',
  parentVariants: {
    size: {
      lg: 'w-6 h-6 border-[3px]',
      md: 'w-5 h-5 border-2',
      sm: 'w-4 h-4 border-2',
    },
  },
});

const checkboxLabelStyle = tva({
  base: 'text-typography-600 data-[checked=true]:text-typography-900 data-[hover=true]:text-typography-900 data-[hover=true]:data-[checked=true]:text-typography-900 data-[hover=true]:data-[checked=true]:data-[disabled=true]:text-typography-900 data-[hover=true]:data-[disabled=true]:text-typography-400 data-[active=true]:text-typography-900 data-[active=true]:data-[checked=true]:text-typography-900 data-[disabled=true]:opacity-40 web:select-none',
  parentVariants: {
    size: {
      lg: 'text-lg',
      md: 'text-base',
      sm: 'text-sm',
    },
  },
});

const checkboxIconStyle = tva({
  base: 'fill-none text-lumus-on-accent',

  parentVariants: {
    size: {
      sm: 'h-3 w-3',
      md: 'h-4 w-4',
      lg: 'h-5 w-5',
    },
  },
});

const CheckboxGroup = UICheckbox.Group;

type ICheckboxProps = React.ComponentPropsWithoutRef<typeof UICheckbox> &
  VariantProps<typeof checkboxStyle>;

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof UICheckbox>,
  ICheckboxProps
>(function Checkbox({ className, size = 'md', ...props }, ref) {
  return (
    <UICheckbox
      className={checkboxStyle({
        class: className,
        size,
      })}
      {...props}
      context={{
        size,
      }}
      ref={ref}
    />
  );
});

type ICheckboxIndicatorProps = React.ComponentPropsWithoutRef<
  typeof UICheckbox.Indicator
> &
  VariantProps<typeof checkboxIndicatorStyle>;

const CheckboxIndicator = React.forwardRef<
  React.ComponentRef<typeof UICheckbox.Indicator>,
  ICheckboxIndicatorProps
>(function CheckboxIndicator({ className, ...props }, ref) {
  const { size: parentSize } = useStyleContext(SCOPE);

  return (
    <UICheckbox.Indicator
      className={checkboxIndicatorStyle({
        parentVariants: {
          size: parentSize,
        },
        class: className,
      })}
      {...props}
      ref={ref}
    />
  );
});

type ICheckboxLabelProps = React.ComponentPropsWithoutRef<
  typeof UICheckbox.Label
> &
  VariantProps<typeof checkboxLabelStyle>;
const CheckboxLabel = React.forwardRef<
  React.ComponentRef<typeof UICheckbox.Label>,
  ICheckboxLabelProps
>(function CheckboxLabel({ className, ...props }, ref) {
  const { size: parentSize } = useStyleContext(SCOPE);
  return (
    <UICheckbox.Label
      className={checkboxLabelStyle({
        parentVariants: {
          size: parentSize,
        },
        class: className,
      })}
      {...props}
      ref={ref}
    />
  );
});

type ICheckboxIconProps = React.ComponentPropsWithoutRef<
  typeof UICheckbox.Icon
> &
  VariantProps<typeof checkboxIconStyle>;

const CheckboxIcon = React.forwardRef<
  React.ComponentRef<typeof UICheckbox.Icon>,
  ICheckboxIconProps
>(function CheckboxIcon({ className, size, ...props }, ref) {
  const { size: parentSize } = useStyleContext(SCOPE);

  if (typeof size === 'number') {
    return (
      <UICheckbox.Icon
        ref={ref}
        {...props}
        className={checkboxIconStyle({ class: className })}
        size={size}
      />
    );
  } else if (
    (props.height !== undefined || props.width !== undefined) &&
    size === undefined
  ) {
    return (
      <UICheckbox.Icon
        ref={ref}
        {...props}
        className={checkboxIconStyle({ class: className })}
      />
    );
  }

  return (
    <UICheckbox.Icon
      className={checkboxIconStyle({
        parentVariants: {
          size: parentSize,
        },
        size,
        class: className,
      })}
      {...props}
      ref={ref}
    />
  );
});

Checkbox.displayName = 'Checkbox';
CheckboxIndicator.displayName = 'CheckboxIndicator';
CheckboxLabel.displayName = 'CheckboxLabel';
CheckboxIcon.displayName = 'CheckboxIcon';

export {
  Checkbox,
  CheckboxIndicator,
  CheckboxLabel,
  CheckboxIcon,
  CheckboxGroup,
};
