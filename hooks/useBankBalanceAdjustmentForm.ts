import React from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { prepareSparkBalanceFormFirebase, submitSparkBalanceFormFirebase, type SparkBalanceFormState } from '@/functions/SparkBalanceFormFirebase';
import { useAuth } from '@/contexts/AuthContext';
import { SPARK_MAX_CENTS } from '@/functions/sparkFinancialProtocol';
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
	const initialBankId = typeof params.bankId === 'string' ? params.bankId : null;
	const { user } = useAuth();
	const uid = user?.uid;
	const scope = JSON.stringify([uid, adjustmentId, initialBankId]);
	const currentScope = React.useRef(scope); currentScope.current = scope;
	const mounted = React.useRef(true);
	React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
	const sessionValid = () => mounted.current && currentScope.current === scope && !!uid && auth.currentUser?.uid === uid;
	const { isDarkMode } = useAppTheme();
	const { shouldHideValues } = useValueVisibility();
	const client = useQueryClient();
	const [bankId, updateBankId] = React.useState<string | null>(initialBankId);
	const [date, updateDate] = React.useState(dateDisplay(new Date()));
	const [value, setValue] = React.useState('');
	const [target, setTarget] = React.useState<number | null>(null);
	const [description, updateDescription] = React.useState('');
	const [submitting, setSubmitting] = React.useState(false);
	const [completed, setCompleted] = React.useState(false);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [reloadKey, setReloadKey] = React.useState(0);
	const [previewReloadKey, setPreviewReloadKey] = React.useState(0);
	const [retryPending, setRetryPending] = React.useState(false);
	const submitLock = React.useRef<object | null>(null);
	const sparkWork = React.useRef<{ key: string; state: SparkBalanceFormState }>({ key: '', state: {} });
	const preparationRequest = React.useRef<AbortController | null>(null);
	const focused = React.useRef(false);
	useFocusEffect(React.useCallback(() => { focused.current = true; return () => { focused.current = false; }; }, []));
	type Pending = { scope: string; signature: string; input: BankBalanceAdjustmentCommand;
		state: SparkBalanceFormState | null; draft: Parameters<typeof submitSparkBalanceFormFirebase>[2] };
	const command = React.useRef<Pending | null>(null);
	const loadKey = JSON.stringify([scope, reloadKey]);
	const [entry, setEntry] = React.useState<{ key: string; loading: boolean; banks: BankActionsheetOption[]; error: string | null }>({ key: '', loading: true, banks: [], error: null });
	const loading = entry.key !== loadKey || entry.loading;
	const error = entry.key === loadKey ? entry.error : null;
	const banks = entry.key === loadKey ? entry.banks : [];
	const parsedDate = isoDate(date);
	React.useEffect(() => {
		preparationRequest.current?.abort(); sparkWork.current = { key: '', state: {} }; command.current = null; submitLock.current = null; setSubmitting(false);
		updateBankId(initialBankId); updateDate(dateDisplay(new Date())); setValue(''); setTarget(null); updateDescription('');
		setRetryPending(false); setCompleted(false); setSubmitError(null);
	}, [scope]);
	React.useEffect(() => {
		let active = true;
		setEntry({ key: loadKey, loading: true, banks: [], error: null });
		void (async () => {
			try {
				if (!uid || auth.currentUser?.uid !== uid) throw new Error('Entre na sua conta para ajustar o saldo.');
				const [options, original] = await Promise.all([getBalanceAdjustmentBanksFirebase(), adjustmentId ? getBankBalanceAdjustmentFirebase(adjustmentId) : null]);
				if (!active || !sessionValid()) return;
				if (adjustmentId && (!original || original.personId !== uid || !canChangeBankBalanceAdjustment(original))) throw new Error('Este ajuste não está disponível para edição.');
				if (original) {
					if (!options.some(bank => bank.id === original.bankId)) throw new Error('O banco deste ajuste não está mais disponível.');
					updateBankId(original.bankId); updateDate(dateDisplay(original.date)); updateDescription(original.description ?? '');
					if (!shouldHideValues) { setTarget(original.targetBalanceInCents); setValue(formatAdjustmentMoney(original.targetBalanceInCents)); }
				}
				setEntry({ key: loadKey, loading: false, banks: options, error: null });
			} catch (reason) {
				if (active && currentScope.current === scope) setEntry({ key: loadKey, loading: false, banks: [], error: reason instanceof Error ? reason.message : 'Não foi possível abrir o formulário.' });
			}
		})();
		return () => { active = false; };
	// Privacidade é lida apenas na abertura: alterná-la não deve apagar um rascunho digitado.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loadKey]);
	const workKey = JSON.stringify([scope, bankId, parsedDate]);
	const previewKey = JSON.stringify([workKey, loadKey, previewReloadKey]);
	type PreviewState = { key: string; loading: boolean; base: number | null; source: 'spark' | 'legacy' | null; error: string | null; progress: string | null };
	const [preview, setPreview] = React.useState<PreviewState>({ key: '', loading: false, base: null, source: null, error: null, progress: null });
	React.useEffect(() => {
		let active = true;
		const initial: PreviewState = { key: previewKey, loading: false, base: null, source: null, error: null, progress: null };
		setPreview(initial);
		if (!bankId || !parsedDate || loading || error || !uid) return;
		if (!banks.some(bank => bank.id === bankId)) { setPreview({ ...initial, error: 'O banco selecionado não está mais disponível. Escolha outro banco.' }); return; }
		setPreview({ ...initial, loading: true });
		const controller = new AbortController(); preparationRequest.current = controller;
		// [[Ajuste de Saldo]]: cada seleção tem estado próprio; uma preparação antiga não modifica a nova.
		if (sparkWork.current.key !== workKey) sparkWork.current = { key: workKey, state: {} };
		const work = sparkWork.current.state;
		void (async () => {
			const spark = await prepareSparkBalanceFormFirebase(db, work, { actorId: uid, accountId: bankId, mode: 'adjustment', date: parsedDate, adjustmentId }, () => createFinancialClientActionId('adjustment_form'), { signal: controller.signal });
			if (!active || !sessionValid()) return;
			if (spark) {
				const progress = spark.proof ? `Histórico: ${spark.proof.workRevision} etapas concluídas.` : null;
				if (spark.base === null) { setPreview({ ...initial, source: 'spark', progress, error: 'A preparação está parcial. Continue para conferir o saldo.' }); return; }
				if (!Number.isSafeInteger(spark.base)) throw new Error('Não foi possível confirmar o saldo.');
				setPreview({ ...initial, source: 'spark', progress, base: spark.base }); return;
			}
			const result = await runBankBalanceAdjustmentFirebase({ action: 'preview', bankId, date: parsedDate, adjustmentId, expectedActorId: uid });
			if (!active || !sessionValid()) return;
			if (!Number.isSafeInteger(result.previousBalanceInCents)) throw new Error('Não foi possível confirmar o saldo.');
			setPreview({ ...initial, source: 'legacy', base: result.previousBalanceInCents });
		})().catch(reason => {
			if (!active || !sessionValid()) return;
			if ((reason as { reason?: string }).reason === 'stale') sparkWork.current = { key: workKey, state: {} };
			setPreview({ ...initial, error: reason instanceof Error ? reason.message : 'Não foi possível calcular o saldo.' });
		});
		return () => { active = false; controller.abort(); };
	}, [previewKey, loading, error, uid]);
	const currentPreview = preview.key === previewKey && !loading ? preview : { base: null, loading: !!bankId && !!parsedDate, error: null, source: null, progress: null };
	const base = currentPreview.base, previewLoading = currentPreview.loading, previewError = currentPreview.error;
	const fieldsLocked = loading || submitting || retryPending || completed;
	const canEdit = () => !fieldsLocked && !submitLock.current;
	const setBankId = (id: string | null) => { if (canEdit() && !adjustmentId) updateBankId(id); };
	const setDate = (next: string) => { if (canEdit()) updateDate(next); };
	const setDescription = (next: string) => { if (canEdit()) updateDescription(next); };
	const onValueChange = (input: string) => {
		if (!canEdit()) return;
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
	const isSpark = currentPreview.source === 'spark' || !!command.current?.state;
	const valueError = target !== null && (!Number.isSafeInteger(target) || (isSpark && Math.abs(target) > SPARK_MAX_CENTS) || (base !== null && difference === null)) ? 'Informe um saldo dentro do limite permitido.' : null;
	const dateError = date && !parsedDate ? 'Escolha uma data válida até hoje.' : null;
	const descriptionError = description.trim().length > 2000 ? 'Use até 2000 caracteres na descrição.' : target !== null && target < 0 && (description.trim().length < 3 || (isSpark && description.trim().length > 500))
		? isSpark ? 'Justifique o saldo negativo com 3 a 500 caracteres.' : 'Descreva o motivo para registrar um saldo negativo.' : null;
	const signature = JSON.stringify([scope, bankId, parsedDate, target, description]);
	const retrySameInput = retryPending && command.current?.scope === scope && command.current.signature === signature;
	const noDifference = difference === 0 && !adjustmentId && !retrySameInput;
	const submitDisabled = loading || submitting || completed || !uid || (retryPending && !retrySameInput) || !bankId || !parsedDate || !!valueError || !!descriptionError ||
		(!retrySameInput && (previewLoading || !!error || !!previewError || difference === null || noDifference));
	const back = React.useCallback(() => bankId
		? navigateToRoute(APP_ROUTE_PATHS.bankMovements, { bankId, bankName: banks.find(bank => bank.id === bankId)?.name, focusDate: date })
		: navigateToRoute(APP_ROUTE_PATHS.home, { tab: '2' }), [bankId, banks, date]);
	const submit = async () => {
		if (submitLock.current || submitDisabled || !sessionValid() || !bankId || !parsedDate || target === null) return;
		if (!retrySameInput) {
			if (base === null || !currentPreview.source) return;
			command.current = { scope, signature, state: isSpark ? sparkWork.current.state : null,
				draft: { actorId: uid!, accountId: bankId, mode: 'adjustment', date: parsedDate, adjustmentId, targetBalanceInCents: target, note: description },
				input: { action: 'save', expectedActorId: uid, bankId, date: parsedDate, adjustmentId, clientActionId: createFinancialClientActionId('bank_adjustment'), targetBalanceInCents: target, expectedPreviousBalanceInCents: base, description } };
		}
		const pending = command.current;
		if (!pending) return;
		const lock = {}; submitLock.current = lock; setSubmitting(true); setSubmitError(null);
		try {
			if (pending.state) await submitSparkBalanceFormFirebase(db, pending.state, pending.draft);
			else await runBankBalanceAdjustmentFirebase(pending.input);
			if (!sessionValid()) return;
			setRetryPending(false); setCompleted(true);
			void Promise.resolve().then(() => client.invalidateQueries({ queryKey: ['finance', uid], refetchType: 'all' })).catch(reason => console.warn('Falha ao atualizar os saldos após o ajuste.', reason));
			if (!focused.current) return;
			showNotifierAlert({ title: adjustmentId ? 'Ajuste atualizado' : 'Saldo ajustado', description: 'A diferença foi registrada nas movimentações do banco.', type: 'success', isDarkMode });
			redirectToRoute(APP_ROUTE_PATHS.bankMovements, { bankId, bankName: banks.find(bank => bank.id === bankId)?.name, focusDate: date });
		} catch (reason) {
			if (!sessionValid()) return;
			const code = (reason as { code?: string })?.code;
			const rejected = pending.state ? pending.state.intent?.status !== 'uncertain' : ['functions/failed-precondition', 'functions/invalid-argument', 'functions/permission-denied', 'functions/unauthenticated'].includes(code ?? '');
			if (rejected) { command.current = null; sparkWork.current = { key: workKey, state: {} }; }
			setRetryPending(!rejected);
			const message = reason instanceof Error ? reason.message : 'Não foi possível salvar o ajuste.';
			setSubmitError(message);
			if (focused.current) showNotifierAlert({ description: message, type: 'error', isDarkMode });
			setPreviewReloadKey(key => key + 1);
		} finally { if (submitLock.current === lock) { submitLock.current = null; if (mounted.current) setSubmitting(false); } }
	};
	const retry = () => {
		if (submitLock.current || retryPending || completed) return;
		if (error || banks.length === 0) { sparkWork.current = { key: '', state: {} }; setReloadKey(key => key + 1); }
		else {
			// Prévia completa se renova; preparação parcial/pausada conserva seu progresso no servidor.
			if (sparkWork.current.state.preview?.base !== null) sparkWork.current = { key: workKey, state: {} };
			setPreviewReloadKey(key => key + 1);
		}
	};
	return { preparationProgress: currentPreview.progress, pausePreparation: () => preparationRequest.current?.abort(), banks, bankId, setBankId, date, setDate, value, onValueChange, target, description, setDescription,
		base, difference, loading, previewLoading, submitting, error, previewError, submitError, valueError, dateError, descriptionError, noDifference, submitDisabled, submit, back, adjustmentId, retry, retryPending, fieldsLocked, completed };
}
