import React from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '@/FirebaseConfig';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { getBalanceAdjustmentBanksFirebase, getBankBalanceAdjustmentFirebase, runBankBalanceAdjustmentFirebase, type BankBalanceAdjustmentCommand } from '@/functions/BankBalanceAdjustmentFirebase';
import { calculateBankBalanceAdjustment, canChangeBankBalanceAdjustment } from '@/utils/bankBalanceAdjustment';
import { APP_ROUTE_PATHS, navigateToRoute, redirectToRoute } from '@/utils/navigation';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import type { BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';

export const formatAdjustmentMoney = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const civilDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
const dateDisplay = (date: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);
const isoDate = (value: string) => {
	const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
	if (!match) return null;
	const iso = `${match[3]}-${match[2]}-${match[1]}`;
	const parsed = new Date(`${iso}T12:00:00-03:00`);
	return !Number.isNaN(parsed.valueOf()) && civilDate(parsed) === iso && iso <= civilDate(new Date()) ? iso : null;
};

export function useBankBalanceAdjustmentForm() {
	const params = useLocalSearchParams<{ adjustmentId?: string; bankId?: string }>();
	const adjustmentId = typeof params.adjustmentId === 'string' ? params.adjustmentId : undefined;
	const { isDarkMode } = useAppTheme();
	const { shouldHideValues } = useValueVisibility();
	const client = useQueryClient();
	const [banks, setBanks] = React.useState<BankActionsheetOption[]>([]);
	const [bankId, setBankId] = React.useState<string | null>(typeof params.bankId === 'string' ? params.bankId : null);
	const [date, setDate] = React.useState(dateDisplay(new Date()));
	const [value, setValue] = React.useState('');
	const [target, setTarget] = React.useState<number | null>(null);
	const [description, setDescription] = React.useState('');
	const [base, setBase] = React.useState<number | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [previewLoading, setPreviewLoading] = React.useState(false);
	const [submitting, setSubmitting] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [previewError, setPreviewError] = React.useState<string | null>(null);
	const [reloadKey, setReloadKey] = React.useState(0);
	const [previewReloadKey, setPreviewReloadKey] = React.useState(0);
	const [retryPending, setRetryPending] = React.useState(false);
	const submitLock = React.useRef(false);
	const focused = React.useRef(false);
	useFocusEffect(React.useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
	const command = React.useRef<{ signature: string; input: BankBalanceAdjustmentCommand } | null>(null);
	const uid = auth.currentUser?.uid;
	const parsedDate = isoDate(date);
	React.useEffect(() => {
		let active = true;
		setLoading(true); setError(null);
		void (async () => {
			try {
				const [options, original] = await Promise.all([getBalanceAdjustmentBanksFirebase(), adjustmentId ? getBankBalanceAdjustmentFirebase(adjustmentId) : null]);
				if (!active || auth.currentUser?.uid !== uid) return;
				if (original && (original.personId !== uid || !canChangeBankBalanceAdjustment(original))) throw new Error('Este ajuste já foi revertido, substituído ou pertence a outra pessoa.');
				setBanks(options);
				if (original) {
					setBankId(original.bankId); setDate(dateDisplay(original.date)); setDescription(original.description ?? '');
					if (!shouldHideValues) { setTarget(original.targetBalanceInCents); setValue(formatAdjustmentMoney(original.targetBalanceInCents)); }
				}
			} catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o formulário.'); }
			finally { if (active) setLoading(false); }
		})();
		return () => { active = false; };
	// Privacidade é lida apenas na abertura: alterná-la não deve apagar um rascunho digitado.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [adjustmentId, reloadKey, uid]);
	React.useEffect(() => {
		let active = true;
		setBase(null); setPreviewError(null);
		if (!bankId || !parsedDate || loading || error) { setPreviewLoading(false); return; }
		setPreviewLoading(true);
		void runBankBalanceAdjustmentFirebase({ action: 'preview', bankId, date: parsedDate, adjustmentId })
			.then(result => { if (active && auth.currentUser?.uid === uid) setBase(result.previousBalanceInCents); })
			.catch(reason => { if (active) setPreviewError(reason instanceof Error ? reason.message : 'Não foi possível calcular o saldo.'); })
			.finally(() => { if (active) setPreviewLoading(false); });
		return () => { active = false; };
	}, [bankId, parsedDate, adjustmentId, loading, error, previewReloadKey, uid]);
	const onValueChange = (input: string) => {
		const digits = input.replace(/\D/g, '');
		const isNegative = input.trimStart().startsWith('-');
		const cents = digits ? Number(digits) * (isNegative ? -1 : 1) : null;
		setTarget(cents);
		setValue(cents !== null && Number.isSafeInteger(cents) ? formatAdjustmentMoney(cents) : digits || (isNegative ? '-' : ''));
	};
	let difference: number | null = null;
	if (base !== null && target !== null && Number.isSafeInteger(target)) {
		try { difference = calculateBankBalanceAdjustment(base, target); } catch { /* O campo mostra a validação abaixo. */ }
	}
	const valueError = target !== null && (!Number.isSafeInteger(target) || (base !== null && difference === null)) ? 'Informe um saldo dentro do limite permitido.' : null;
	const dateError = date && !parsedDate ? 'Escolha uma data válida até hoje.' : null;
	const descriptionError = target !== null && target < 0 && description.trim().length < 3 ? 'Descreva o motivo para registrar um saldo negativo.' : null;
	const signature = JSON.stringify([bankId, parsedDate, target, description, adjustmentId]);
	const retrySameInput = retryPending && command.current?.signature === signature;
	const noDifference = difference === 0 && !adjustmentId && !retrySameInput;
	const submitDisabled = loading || submitting || !bankId || !parsedDate || !!valueError || !!descriptionError ||
		(!retrySameInput && (previewLoading || !!error || !!previewError || difference === null || noDifference));
	const back = React.useCallback(() => bankId
		? navigateToRoute(APP_ROUTE_PATHS.bankMovements, { bankId, bankName: banks.find(bank => bank.id === bankId)?.name, focusDate: date })
		: navigateToRoute(APP_ROUTE_PATHS.home, { tab: '2' }), [bankId, banks, date]);
	const submit = async () => {
		if (submitLock.current || submitDisabled || !bankId || !parsedDate || target === null) return;
		if (!retrySameInput) {
			if (base === null) return;
			command.current = { signature, input: { action: 'save', bankId, date: parsedDate, adjustmentId, clientActionId: createFinancialClientActionId('bank_adjustment'), targetBalanceInCents: target, expectedPreviousBalanceInCents: base, description } };
		}
		if (!command.current) return;
		submitLock.current = true; setSubmitting(true);
		try {
			await runBankBalanceAdjustmentFirebase(command.current.input);
			void client.invalidateQueries({ refetchType: 'all' });
			if (!focused.current || auth.currentUser?.uid !== uid) return;
			showNotifierAlert({ title: adjustmentId ? 'Ajuste atualizado' : 'Saldo ajustado', description: 'A diferença foi registrada nas movimentações do banco.', type: 'success', isDarkMode });
			redirectToRoute(APP_ROUTE_PATHS.bankMovements, { bankId, bankName: banks.find(bank => bank.id === bankId)?.name, focusDate: date });
		} catch (reason) {
			if (!focused.current || auth.currentUser?.uid !== uid) return;
			const code = (reason as { code?: string })?.code;
			const rejected = ['functions/failed-precondition', 'functions/invalid-argument', 'functions/permission-denied', 'functions/unauthenticated'].includes(code ?? '');
			if (rejected) command.current = null;
			setRetryPending(!rejected);
			showNotifierAlert({ description: reason instanceof Error ? reason.message : 'Não foi possível salvar o ajuste.', type: 'error', isDarkMode });
			setPreviewReloadKey(key => key + 1);
		} finally { submitLock.current = false; setSubmitting(false); }
	};
	return { banks, bankId, setBankId, date, setDate, value, onValueChange, target, description, setDescription, base, difference, loading, previewLoading, submitting, error, previewError, valueError, dateError, descriptionError, noDifference, submitDisabled, submit, back, adjustmentId, retry: () => error ? setReloadKey(key => key + 1) : setPreviewReloadKey(key => key + 1) };
}
