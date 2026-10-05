import React from 'react';
import { Box } from '@/components/ui/box';
import { cn } from '@/lib/utils';
import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';

type Props = {
	children: React.ReactNode;
	className?: string;
};

export default function BankBalanceAttachedPanel({ children, className }: Props) {
	return (
		<Box className={cn(LUMUS_CLASS_NAMES.cardBordered, LUMUS_CLASS_NAMES.surfaceFill, 'relative z-0 mx-7 -mt-2 rounded-t-none border-t-0 px-4 pt-4 pb-3', className)} aria-live="polite">
			{children}
		</Box>
	);
}
