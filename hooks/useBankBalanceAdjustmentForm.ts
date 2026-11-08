import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import type { BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
import { navigateToHomeDashboard } from '@/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
export const formatAdjustmentMoney = (cents: number) =>
	new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function useBankBalanceAdjustmentForm() {
	const params = useLocalSearchParams<{ adjustmentId?: string; bankId?: string }>();
	const [bankId, setBankId] = React.useState<string | null>(params.bankId ?? null);
	const [date, setDate] = React.useState(() =>
		new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
	);
	const [value, onValueChange] = React.useState('');
	const [description, setDescription] = React.useState('');
	return {
		banks: [] as BankActionsheetOption[],
		bankId,
		setBankId,
		date,
		setDate,
		value,
		onValueChange,
		description,
		setDescription,
		target: null as number | null,
		base: null as number | null,
		difference: null as number | null,
		loading: false,
		previewLoading: false,
		submitting: false,
		error: null as string | null,
		previewError: FEATURE_UNAVAILABLE_MESSAGE,
		submitError: null as string | null,
		valueError: null as string | null,
		dateError: null as string | null,
		descriptionError: null as string | null,
		noDifference: false,
		submitDisabled: true,
		submit: async () => showFeatureUnavailable(),
		back: navigateToHomeDashboard,
		adjustmentId: params.adjustmentId,
		retry: showFeatureUnavailable,
		retryPending: false,
		fieldsLocked: false,
		completed: false,
		preparationProgress: null as string | null,
		pausePreparation: () => {},
	};
}
