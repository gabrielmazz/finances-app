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
  base: 'group/modal w-full h-full justify-center items-center p-4 web:pointer-events-none',
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
  base: 'min-h-0 max-h-full shrink bg-background-0 rounded-modal overflow-hidden border border-outline-200 shadow-hard-5 p-0',
  parentVariants: {
    size: {
      xs: 'w-full max-w-modal-xs',
      sm: 'w-full max-w-modal-sm',
      md: 'w-full max-w-modal-md',
      lg: 'w-full max-w-modal-lg',
      full: 'w-full',
    },
  },
});

const modalBodyStyle = tva({
  base: 'min-h-0 w-full shrink px-4 pt-4 sm:px-6 web:overscroll-contain',
});

const modalCloseButtonStyle = tva({
  base: 'group/modal-close-button z-10 h-touch w-touch shrink-0 items-center justify-center rounded-control bg-transparent dark:bg-transparent data-[focus-visible=true]:web:bg-background-100 data-[focus-visible=true]:web:ring-2 data-[focus-visible=true]:web:ring-lumus-focus cursor-pointer',
});

const modalHeaderStyle = tva({
  base: 'w-full shrink-0 justify-between items-center flex-row gap-3 px-4 pt-4 sm:px-6 sm:pt-6',
});

const modalFooterStyle = tva({
  base: 'w-full shrink-0 flex-row flex-wrap justify-end items-center gap-3 px-4 pb-4 pt-4 sm:px-6 sm:pb-6',
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
      className={`min-w-0 shrink text-slate-900 dark:text-slate-100 uppercase tracking-widest ${className ?? ''}`.trim()}
      {...props}
    />
  );
}

const Modal = React.forwardRef<React.ComponentRef<typeof UIModal>, IModalProps>(
  ({ className, size = 'lg', ...props }, ref) => (
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
