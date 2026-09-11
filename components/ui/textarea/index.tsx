'use client';
import React from 'react';
import { createTextarea } from '@gluestack-ui/core/textarea/creator';
import { View, TextInput } from 'react-native';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import {
  withStyleContext,
  useStyleContext,
} from '@gluestack-ui/utils/nativewind-utils';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';

const SCOPE = 'TEXTAREA';
const UITextarea = createTextarea({
  Root: withStyleContext(View, SCOPE),
  Input: TextInput,
});

const textareaStyle = tva({
  base: 'h-25 w-full rounded-control border border-slate-200 bg-white data-[hover=true]:border-slate-400 data-[focus=true]:border-lumus-focus data-[focus=true]:web:ring-2 data-[focus=true]:web:ring-lumus-focus/35 data-[invalid=true]:border-error-700 data-[invalid=true]:web:ring-2 data-[invalid=true]:web:ring-error-500/30 data-[disabled=true]:opacity-40 dark:border-slate-800 dark:bg-slate-950',

  variants: {
    variant: {
      default:
        '',
    },
    size: {
      sm: '',
      md: '',
      lg: '',
      xl: '',
    },
  },
});

const textareaInputStyle = tva({
  base: 'flex-1 p-3 text-slate-900 placeholder:text-slate-500 dark:text-slate-100 web:cursor-text web:outline-none web:data-[disabled=true]:cursor-not-allowed',
  parentVariants: {
    size: {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
    },
  },
});

type ITextareaProps = React.ComponentProps<typeof UITextarea> &
  VariantProps<typeof textareaStyle>;

const Textarea = React.forwardRef<
  React.ComponentRef<typeof UITextarea>,
  ITextareaProps
>(function Textarea(
  { className, variant = 'default', size = 'md', ...props },
  ref
) {
  return (
    <UITextarea
      ref={ref}
      {...props}
      className={textareaStyle({ variant, class: className })}
      context={{ size }}
    />
  );
});

type ITextareaInputProps = React.ComponentProps<typeof UITextarea.Input> &
  VariantProps<typeof textareaInputStyle>;

const TextareaInput = React.forwardRef<
  React.ComponentRef<typeof TextInput>,
  ITextareaInputProps
>(function TextareaInput({ className, ...props }, ref) {
  const { size: parentSize } = useStyleContext(SCOPE);

  return (
    <UITextarea.Input
      ref={ref as React.Ref<any>}
      {...props}
      textAlignVertical="top"
      className={textareaInputStyle({
        parentVariants: {
          size: parentSize,
        },
        class: className,
      })}
    />
  );
});

Textarea.displayName = 'Textarea';
TextareaInput.displayName = 'TextareaInput';

export { Textarea, TextareaInput };
