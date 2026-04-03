'use client';
import React from 'react';
import { createModal } from '@gluestack-ui/core/modal/creator';
import { Pressable, View, ScrollView, ViewStyle } from 'react-native';
import { Heading } from '@/components/ui/heading';
import { CloseIcon, Icon } from '@/components/ui/icon';
import {
  Motion,
  AnimatePresence,
  createMotionAnimatedComponent,
  MotionComponentProps,
} from '@legendapp/motion';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import {
  withStyleContext,
  useStyleContext,
} from '@gluestack-ui/utils/nativewind-utils';
import { cssInterop } from 'nativewind';
import type { VariantProps } from '@gluestack-ui/utils/nativewind-utils';

type IAnimatedPressableProps = React.ComponentProps<typeof Pressable> &
  MotionComponentProps<typeof Pressable, ViewStyle, unknown, unknown, unknown>;

const AnimatedPressable = createMotionAnimatedComponent(
  Pressable
) as React.ComponentType<IAnimatedPressableProps>;
const SCOPE = 'MODAL';

type IMotionViewProps = React.ComponentProps<typeof View> &
  MotionComponentProps<typeof View, ViewStyle, unknown, unknown, unknown>;

const MotionView = Motion.View as React.ComponentType<IMotionViewProps>;

const UIModal = createModal({
  Root: withStyleContext(View, SCOPE),
  Backdrop: AnimatedPressable,
  Content: MotionView,
  Body: ScrollView,
  CloseButton: Pressable,
  Footer: View,
  Header: View,
  AnimatePresence: AnimatePresence,
});

cssInterop(AnimatedPressable, { className: 'style' });
cssInterop(MotionView, { className: 'style' });

const modalStyle = tva({
  base: 'group/modal w-full h-full justify-center items-center web:pointer-events-none',
  variants: {
    size: {
      xs: '',
      sm: '',
      md: '',
      lg: '',
      full: '',
    },
  },
});

const modalBackdropStyle = tva({
  base: 'absolute left-0 top-0 right-0 bottom-0 bg-black/70 web:cursor-default',
});

const modalContentStyle = tva({
  base: 'bg-background-0 rounded-[28px] overflow-hidden border border-outline-200 shadow-hard-5 p-0',
  parentVariants: {
    size: {
      xs: 'w-[60%] max-w-[360px]',
      sm: 'w-[70%] max-w-[420px]',
      md: 'w-[80%] max-w-[510px]',
      lg: 'w-[90%] max-w-[640px]',
      full: 'w-full',
    },
  },
});

const modalBodyStyle = tva({
  base: 'w-full px-6 pt-4',
});

const modalCloseButtonStyle = tva({
  base: 'group/modal-close-button z-10 h-10 w-10 items-center justify-center rounded-2xl bg-transparent dark:bg-transparent data-[focus-visible=true]:web:bg-background-100 web:outline-0 cursor-pointer',
});

const modalHeaderStyle = tva({
  base: 'w-full justify-between items-center flex-row gap-4 px-6 pt-6',
});

const modalFooterStyle = tva({
  base: 'w-full flex-row flex-wrap justify-end items-center gap-3 px-6 pb-6 pt-4',
});

type IModalProps = React.ComponentProps<typeof UIModal> &
  VariantProps<typeof modalStyle> & { className?: string };

type IModalBackdropProps = React.ComponentProps<typeof UIModal.Backdrop> &
  VariantProps<typeof modalBackdropStyle> & { className?: string };

type IModalContentProps = React.ComponentProps<typeof UIModal.Content> &
  VariantProps<typeof modalContentStyle> & { className?: string };

type IModalHeaderProps = React.ComponentProps<typeof UIModal.Header> &
  VariantProps<typeof modalHeaderStyle> & { className?: string };

type IModalBodyProps = React.ComponentProps<typeof UIModal.Body> &
  VariantProps<typeof modalBodyStyle> & { className?: string };

type IModalFooterProps = React.ComponentProps<typeof UIModal.Footer> &
  VariantProps<typeof modalFooterStyle> & { className?: string };

type IModalCloseButtonProps = React.ComponentProps<typeof UIModal.CloseButton> &
  VariantProps<typeof modalCloseButtonStyle> & { className?: string };

type IModalTitleProps = React.ComponentProps<typeof Heading>;

function ModalTitle({ className, size = 'lg', ...props }: IModalTitleProps) {
  return (
    <Heading
      size={size}
      className={`text-slate-900 dark:text-slate-100 uppercase tracking-widest ${className ?? ''}`.trim()}
      {...props}
    />
  );
}

const Modal = React.forwardRef<React.ComponentRef<typeof UIModal>, IModalProps>(
  ({ className, size = 'md', ...props }, ref) => (
    <UIModal
      ref={ref}
      {...props}
      pointerEvents="box-none"
      className={modalStyle({ size, class: className })}
      context={{ size }}
    />
  )
);

const ModalBackdrop = React.forwardRef<
  React.ComponentRef<typeof UIModal.Backdrop>,
  IModalBackdropProps
>(function ModalBackdrop({ className, ...props }, ref) {
  return (
    <UIModal.Backdrop
      ref={ref}
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      exit={{
        opacity: 0,
      }}
      transition={{
        type: 'spring',
        damping: 18,
        stiffness: 250,
        opacity: {
          type: 'timing',
          duration: 250,
        },
      }}
      {...props}
      className={modalBackdropStyle({
        class: className,
      })}
    />
  );
});

const ModalContent = React.forwardRef<
  React.ComponentRef<typeof UIModal.Content>,
  IModalContentProps
>(function ModalContent({ className, size, ...props }, ref) {
  const { size: parentSize } = useStyleContext(SCOPE);

  return (
    <UIModal.Content
      ref={ref}
      initial={{
        opacity: 0,
        scale: 0.9,
      }}
      animate={{
        opacity: 1,
        scale: 1,
      }}
      exit={{
        opacity: 0,
      }}
      transition={{
        type: 'spring',
        damping: 18,
        stiffness: 250,
        opacity: {
          type: 'timing',
          duration: 250,
        },
      }}
      {...props}
      className={modalContentStyle({
        parentVariants: {
          size: parentSize,
        },
        size,
        class: className,
      })}
      pointerEvents="auto"
    />
  );
});

const ModalHeader = React.forwardRef<
  React.ComponentRef<typeof UIModal.Header>,
  IModalHeaderProps
>(function ModalHeader({ className, ...props }, ref) {
  return (
    <UIModal.Header
      ref={ref}
      {...props}
      className={modalHeaderStyle({
        class: className,
      })}
    />
  );
});

const ModalBody = React.forwardRef<
  React.ComponentRef<typeof UIModal.Body>,
  IModalBodyProps
>(function ModalBody({ className, ...props }, ref) {
  return (
    <UIModal.Body
      ref={ref}
      {...props}
      className={modalBodyStyle({
        class: className,
      })}
    />
  );
});

const ModalFooter = React.forwardRef<
  React.ComponentRef<typeof UIModal.Footer>,
  IModalFooterProps
>(function ModalFooter({ className, ...props }, ref) {
  return (
    <UIModal.Footer
      ref={ref}
      {...props}
      className={modalFooterStyle({
        class: className,
      })}
    />
  );
});

const ModalCloseButton = React.forwardRef<
  React.ComponentRef<typeof UIModal.CloseButton>,
  IModalCloseButtonProps
>(function ModalCloseButton({ children, className, ...props }, ref) {
  return (
    <UIModal.CloseButton
      ref={ref}
      {...props}
      className={modalCloseButtonStyle({
        class: className,
      })}
    >
      {children ?? <Icon as={CloseIcon} size="sm" className="text-slate-500 dark:text-slate-300" />}
    </UIModal.CloseButton>
  );
});

Modal.displayName = 'Modal';
ModalBackdrop.displayName = 'ModalBackdrop';
ModalContent.displayName = 'ModalContent';
ModalHeader.displayName = 'ModalHeader';
ModalBody.displayName = 'ModalBody';
ModalFooter.displayName = 'ModalFooter';
ModalCloseButton.displayName = 'ModalCloseButton';

export {
  Modal,
  ModalTitle,
  ModalBackdrop,
  ModalContent,
  ModalCloseButton,
  ModalHeader,
  ModalBody,
  ModalFooter,
};
