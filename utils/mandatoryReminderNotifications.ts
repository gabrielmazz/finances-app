import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import {
	buildMandatoryReminderOffsets,
	normalizeMandatoryReminderLeadDays,
} from '@/utils/mandatoryReminderConfig';
import {
	ensureLegacyNotificationMigration,
	ensureLocalNotificationPermission,
	getMandatoryReminderChannelConfig,
	hasLocalNotificationPermission,
	isMandatoryReminderNotificationChannelEnabled,
	isNotificationsEnvironmentSupported,
	type LocalNotificationPermissionResult,
	type MandatoryReminderKind,
} from '@/utils/localNotifications';

export type { MandatoryReminderKind } from '@/utils/localNotifications';

export type MandatoryReminderPermissionResult = LocalNotificationPermissionResult;

export type MandatoryReminderScheduleResult =
	| {
			success: true;
			nextTriggerAt: Date;
			horizonEndAt: Date;
			scheduledCount: number;
			title: string;
			body: string;
			capacityLimited?: boolean;
		}
	| {
			success: false;
			reason:
				| 'permissions-denied'
				| 'channel-disabled'
				| 'capacity-limit'
				| 'unavailable'
				| 'invalid-trigger'
				| 'schedule-error';
			message: string;
		};

export type MandatoryReminderSyncItem = {
	id: string;
	name: string;
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderEnabled?: boolean;
	reminderHour?: number;
	reminderMinute?: number;
	reminderDaysBefore?: number;
	reminderOnDueDate?: boolean;
	description?: string | null;
	lastCompletedCycle?: string | null;
	activeFromDate?: Date | string | null;
	activeThroughDate?: Date | string | null;
};

type MandatoryReminderConfig = {
	accountId: string;
	kind: MandatoryReminderKind;
	id: string;
	name: string;
	dueDay: number;
	usesBusinessDays: boolean;
	reminderHour: number;
	reminderMinute: number;
	reminderDaysBefore: number;
	reminderOnDueDate: boolean;
	description: string | null;
	lastCompletedCycle: string | null;
	activeFromDate: string | null;
	activeThroughDate: string | null;
};

type ReminderStorageEntry = {
	fingerprint: string;
	config: MandatoryReminderConfig;
	scheduleIds: string[];
	nextTriggerAt: string | null;
	horizonEndAt: string | null;
	status?:
		| 'pending'
		| 'scheduled'
		| 'permission-denied'
		| 'channel-disabled'
		| 'capacity-limited'
		| 'no-future'
		| 'schedule-error';
};

type ReminderStore = {
	version: 1;
	activeAccountId: string | null;
	lastReconciledAt: string | null;
	entries: Record<string, ReminderStorageEntry>;
};

type ReminderOccurrence = {
	id: string;
	triggerAt: Date;
	dueAt: Date;
	cycleKey: string;
	daysBefore: number;
	title: string;
	body: string;
};

const STORAGE_KEY = '@lumusMandatoryReminders:expo-v1';
const NOTIFICATION_SYSTEM_ID = 'lumus-mandatory-reminders-v1';
const ANDROID_HORIZON_MONTHS = 6;
const IOS_HORIZON_MONTHS = 2;
const ANDROID_MANAGED_SCHEDULE_LIMIT = 400;
const IOS_MANAGED_SCHEDULE_LIMIT = 60;
const RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

const createEmptyStore = (): ReminderStore => ({
	version: 1,
	activeAccountId: null,
	lastReconciledAt: null,
	entries: {},
});

let mutationQueue: Promise<void> = Promise.resolve();
let runtimeActiveAccountId: string | null | undefined;
let runtimeAccountEpoch = 0;

type AccountMutationGuard = {
	accountId: string;
	epoch: number;
};

const setRuntimeActiveAccount = (accountId: string | null) => {
	if (runtimeActiveAccountId !== accountId) {
		runtimeActiveAccountId = accountId;
		runtimeAccountEpoch += 1;
	}
	return runtimeAccountEpoch;
};

const captureAccountMutationGuard = (accountId: string): AccountMutationGuard => ({
	accountId,
	epoch: runtimeAccountEpoch,
});

const isAccountMutationCurrent = ({ accountId, epoch }: AccountMutationGuard) =>
	epoch === runtimeAccountEpoch &&
	(runtimeActiveAccountId === undefined || runtimeActiveAccountId === accountId);

const runExclusive = <T>(operation: () => Promise<T>) => {
	const result = mutationQueue.then(operation, operation);
	mutationQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
};

const normalizeDay = (value: number) => Math.min(Math.max(Math.trunc(value) || 1, 1), 31);
const normalizeHour = (value: number) => Math.min(Math.max(Math.trunc(value) || 0, 0), 23);
const normalizeMinute = (value: number) => Math.min(Math.max(Math.trunc(value) || 0, 0), 59);
const normalizeName = (value: string) => value.trim();
const normalizeDescription = (value?: string | null) => {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const normalizeCycleKey = (value?: string | null) =>
	typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;

const normalizeDateToIso = (value?: Date | string | null) => {
	if (!value) {
		return null;
	}

	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const buildStorageKey = (accountId: string, kind: MandatoryReminderKind, templateId: string) =>
	`${accountId}:${kind}:${templateId}`;

const REMINDER_ENTRY_STATUSES = new Set<NonNullable<ReminderStorageEntry['status']>>([
	'pending',
	'scheduled',
	'permission-denied',
	'channel-disabled',
	'capacity-limited',
	'no-future',
	'schedule-error',
]);

const normalizeStoredEntry = (value: unknown): ReminderStorageEntry | null => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	const source = value as Record<string, unknown>;
	if (!source.config || typeof source.config !== 'object' || Array.isArray(source.config)) {
		return null;
	}

	const configSource = source.config as Record<string, unknown>;
	const accountId = typeof configSource.accountId === 'string' ? configSource.accountId.trim() : '';
	const kind = configSource.kind === 'expense' || configSource.kind === 'gain' ? configSource.kind : null;
	const id = typeof configSource.id === 'string' ? configSource.id.trim() : '';
	const name = typeof configSource.name === 'string' ? normalizeName(configSource.name) : '';
	const dueDay = Number(configSource.dueDay);
	const reminderHour = Number(configSource.reminderHour);
	const reminderMinute = Number(configSource.reminderMinute);
	const reminderDaysBefore = Number(configSource.reminderDaysBefore);
	const reminderOnDueDate = configSource.reminderOnDueDate === true;
	if (
		!accountId ||
		!kind ||
		!id ||
		!name ||
		!Number.isInteger(dueDay) ||
		dueDay < 1 ||
		dueDay > 31 ||
		!Number.isInteger(reminderHour) ||
		reminderHour < 0 ||
		reminderHour > 23 ||
		!Number.isInteger(reminderMinute) ||
		reminderMinute < 0 ||
		reminderMinute > 59 ||
		!Number.isInteger(reminderDaysBefore) ||
		reminderDaysBefore < 0 ||
		reminderDaysBefore > 3 ||
		(reminderDaysBefore === 0 && !reminderOnDueDate)
	) {
		return null;
	}

	const config: MandatoryReminderConfig = {
		accountId,
		kind,
		id,
		name,
		dueDay,
		usesBusinessDays: configSource.usesBusinessDays === true,
		reminderHour,
		reminderMinute,
		reminderDaysBefore,
		reminderOnDueDate,
		description: normalizeDescription(
			typeof configSource.description === 'string' ? configSource.description : null,
		),
		lastCompletedCycle: normalizeCycleKey(
			typeof configSource.lastCompletedCycle === 'string' ? configSource.lastCompletedCycle : null,
		),
		activeFromDate: normalizeDateToIso(
			typeof configSource.activeFromDate === 'string' ? configSource.activeFromDate : null,
		),
		activeThroughDate: normalizeDateToIso(
			typeof configSource.activeThroughDate === 'string' ? configSource.activeThroughDate : null,
		),
	};
	if (buildMandatoryReminderOffsets(config.reminderDaysBefore, config.reminderOnDueDate).length === 0) {
		return null;
	}

	const scheduleIds = Array.isArray(source.scheduleIds)
		? Array.from(new Set(source.scheduleIds.filter((item): item is string => typeof item === 'string' && item.length > 0)))
		: [];
	const storedStatus =
		typeof source.status === 'string' &&
		REMINDER_ENTRY_STATUSES.has(source.status as NonNullable<ReminderStorageEntry['status']>)
			? (source.status as NonNullable<ReminderStorageEntry['status']>)
			: 'pending';

	return {
		fingerprint: typeof source.fingerprint === 'string' ? source.fingerprint : '',
		config,
		scheduleIds,
		nextTriggerAt: normalizeDateToIso(
			typeof source.nextTriggerAt === 'string' ? source.nextTriggerAt : null,
		),
		horizonEndAt: normalizeDateToIso(
			typeof source.horizonEndAt === 'string' ? source.horizonEndAt : null,
		),
		status: scheduleIds.length === 0 && storedStatus === 'scheduled' ? 'pending' : storedStatus,
	};
};

const getCycleKey = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getCycleKeyFromIso = (value: string | null) => {
	if (!value) {
		return null;
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : getCycleKey(parsed);
};

const readReminderStore = async (): Promise<ReminderStore> => {
	try {
		const rawValue = await AsyncStorage.getItem(STORAGE_KEY);
		if (!rawValue) {
			return createEmptyStore();
		}

		const parsed = JSON.parse(rawValue) as Partial<ReminderStore>;
		if (
			parsed.version !== 1 ||
			!parsed.entries ||
			typeof parsed.entries !== 'object' ||
			Array.isArray(parsed.entries)
		) {
			return createEmptyStore();
		}
		const entries = Object.values(parsed.entries).reduce<Record<string, ReminderStorageEntry>>(
			(result, value) => {
				const entry = normalizeStoredEntry(value);
				if (entry) {
					result[buildStorageKey(entry.config.accountId, entry.config.kind, entry.config.id)] = entry;
				}
				return result;
			},
			{},
		);

		return {
			version: 1,
			activeAccountId:
				typeof parsed.activeAccountId === 'string' && parsed.activeAccountId.trim()
					? parsed.activeAccountId.trim()
					: null,
			lastReconciledAt: typeof parsed.lastReconciledAt === 'string' ? parsed.lastReconciledAt : null,
			entries,
		};
	} catch (error) {
		console.error('Erro ao ler as configurações locais dos lembretes:', error);
		return createEmptyStore();
	}
};

const writeReminderStore = async (store: ReminderStore) => {
	await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

const buildConfig = ({
	accountId,
	kind,
	templateId,
	name,
	dueDay,
	usesBusinessDays,
	reminderHour,
	reminderMinute,
	reminderDaysBefore,
	reminderOnDueDate,
	description,
	lastCompletedCycle,
	activeFromDate,
	activeThroughDate,
}: {
	accountId: string;
	kind: MandatoryReminderKind;
	templateId: string;
	name: string;
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderHour: number;
	reminderMinute: number;
	reminderDaysBefore?: number;
	reminderOnDueDate?: boolean;
	description?: string | null;
	lastCompletedCycle?: string | null;
	activeFromDate?: Date | string | null;
	activeThroughDate?: Date | string | null;
}): MandatoryReminderConfig => ({
	accountId: accountId.trim(),
	kind,
	id: templateId.trim(),
	name: normalizeName(name),
	dueDay: normalizeDay(dueDay),
	usesBusinessDays: usesBusinessDays === true,
	reminderHour: normalizeHour(reminderHour),
	reminderMinute: normalizeMinute(reminderMinute),
	reminderDaysBefore: normalizeMandatoryReminderLeadDays(reminderDaysBefore, kind === 'expense' ? 1 : 0),
	reminderOnDueDate: reminderOnDueDate ?? kind === 'gain',
	description: normalizeDescription(description),
	lastCompletedCycle: normalizeCycleKey(lastCompletedCycle),
	activeFromDate: normalizeDateToIso(activeFromDate),
	activeThroughDate: normalizeDateToIso(activeThroughDate),
});

const getHorizonMonths = () => (Platform.OS === 'ios' ? IOS_HORIZON_MONTHS : ANDROID_HORIZON_MONTHS);
const getManagedScheduleLimit = () =>
	Platform.OS === 'ios' ? IOS_MANAGED_SCHEDULE_LIMIT : ANDROID_MANAGED_SCHEDULE_LIMIT;
const getCurrentTimeZoneId = () => {
	try {
		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return typeof timeZone === 'string' && timeZone.length > 0 ? timeZone : null;
	} catch {
		return null;
	}
};

const buildFingerprint = (config: MandatoryReminderConfig) =>
	JSON.stringify({
		engine: 'expo-notifications-v1',
		config,
		channelId: getMandatoryReminderChannelConfig(config.kind).id,
		horizonMonths: getHorizonMonths(),
		timezoneId: getCurrentTimeZoneId(),
		timezoneOffsetMinutes: new Date().getTimezoneOffset(),
	});

const stableHash = (value: string) => {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
};

const buildNotificationId = (
	config: MandatoryReminderConfig,
	cycleKey: string,
	daysBefore: number,
	fingerprint = buildFingerprint(config),
) =>
	`lumus-reminder-v1-${stableHash(config.accountId)}-${config.kind}-${stableHash(config.id)}-${stableHash(
		fingerprint,
	)}-${cycleKey}-${daysBefore}`;

const formatDueDate = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);

const buildReminderContent = (config: MandatoryReminderConfig, daysBefore: number, dueAt: Date) => {
	const observationSuffix = config.description ? ` Observação: ${config.description}` : '';

	if (config.kind === 'expense') {
		if (daysBefore === 0) {
			return {
				title: `Pagamento vence hoje: ${config.name}`,
				body: `Chegou o dia de pagar ${config.name}. Finalize o pagamento para evitar atraso.${observationSuffix}`,
			};
		}

		return {
			title: `Pagamento em ${daysBefore} ${daysBefore === 1 ? 'dia' : 'dias'}: ${config.name}`,
			body: `O pagamento de ${config.name} vence em ${formatDueDate(dueAt)}. Programe o pagamento.${observationSuffix}`,
		};
	}

	if (daysBefore === 0) {
		return {
			title: `Recebimento previsto hoje: ${config.name}`,
			body: `Confira o recebimento de ${config.name} previsto para hoje.${observationSuffix}`,
		};
	}

	return {
		title: `Recebimento em ${daysBefore} ${daysBefore === 1 ? 'dia' : 'dias'}: ${config.name}`,
		body: `O recebimento de ${config.name} está previsto para ${formatDueDate(dueAt)}.${observationSuffix}`,
	};
};

const subtractCalendarDays = (date: Date, amount: number) => {
	const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
	result.setDate(result.getDate() - amount);
	return result;
};

const buildFutureOccurrences = (
	config: MandatoryReminderConfig,
	fromDate = new Date(),
	horizonMonths = getHorizonMonths(),
): ReminderOccurrence[] => {
	const offsets = buildMandatoryReminderOffsets(config.reminderDaysBefore, config.reminderOnDueDate);
	if (offsets.length === 0) {
		return [];
	}

	const activeFromCycle = getCycleKeyFromIso(config.activeFromDate);
	const activeThroughCycle = getCycleKeyFromIso(config.activeThroughDate);
	const fingerprint = buildFingerprint(config);
	const occurrences: ReminderOccurrence[] = [];

	for (let monthOffset = 0; monthOffset < horizonMonths; monthOffset += 1) {
		const referenceDate = new Date(fromDate.getFullYear(), fromDate.getMonth() + monthOffset, 1, 12, 0, 0, 0);
		const cycleKey = getCycleKey(referenceDate);

		if (
			(activeFromCycle && cycleKey < activeFromCycle) ||
			(activeThroughCycle && cycleKey > activeThroughCycle) ||
			config.lastCompletedCycle === cycleKey
		) {
			continue;
		}

		const resolvedDueDate = resolveMonthlyOccurrence({
			referenceDate,
			dueDay: config.dueDay,
			usesBusinessDays: config.usesBusinessDays,
		}).date;
		const dueAt = new Date(
			resolvedDueDate.getFullYear(),
			resolvedDueDate.getMonth(),
			resolvedDueDate.getDate(),
			config.reminderHour,
			config.reminderMinute,
			0,
			0,
		);

		for (const daysBefore of offsets) {
			const reminderDate = subtractCalendarDays(dueAt, daysBefore);
			const triggerAt = new Date(
				reminderDate.getFullYear(),
				reminderDate.getMonth(),
				reminderDate.getDate(),
				config.reminderHour,
				config.reminderMinute,
				0,
				0,
			);

			if (triggerAt.getTime() <= fromDate.getTime()) {
				continue;
			}

			occurrences.push({
				id: buildNotificationId(config, cycleKey, daysBefore, fingerprint),
				triggerAt,
				dueAt,
				cycleKey,
				daysBefore,
				...buildReminderContent(config, daysBefore, dueAt),
			});
		}
	}

	return occurrences.sort((left, right) => left.triggerAt.getTime() - right.triggerAt.getTime());
};

type ReminderOccurrencePlan = {
	storageKey: string;
	entry: ReminderStorageEntry;
	allOccurrences: ReminderOccurrence[];
	selectedOccurrences: ReminderOccurrence[];
};

const comparePlannedOccurrences = (
	left: { storageKey: string; occurrence: ReminderOccurrence },
	right: { storageKey: string; occurrence: ReminderOccurrence },
) =>
	left.occurrence.triggerAt.getTime() - right.occurrence.triggerAt.getTime() ||
	left.storageKey.localeCompare(right.storageKey) ||
	left.occurrence.id.localeCompare(right.occurrence.id);

const buildGlobalOccurrencePlan = (
	store: ReminderStore,
	accountId: string,
	enabledKinds: Set<MandatoryReminderKind>,
	scheduleBudget: number,
) => {
	const entryPlans = Object.entries(store.entries)
		.filter(([, entry]) => entry.config.accountId === accountId)
		.map(([storageKey, entry]): ReminderOccurrencePlan => ({
			storageKey,
			entry,
			allOccurrences: buildFutureOccurrences(entry.config),
			selectedOccurrences: [],
		}));
	const selectablePlans = entryPlans.filter(
		plan => enabledKinds.has(plan.entry.config.kind) && plan.allOccurrences.length > 0,
	);
	const normalizedBudget = Math.max(0, Math.trunc(scheduleBudget));
	let plannedCount = 0;

	const firstOccurrences = selectablePlans
		.map(plan => ({ storageKey: plan.storageKey, occurrence: plan.allOccurrences[0] }))
		.sort(comparePlannedOccurrences);
	const selectedByStorageKey = new Map(entryPlans.map(plan => [plan.storageKey, plan.selectedOccurrences]));
	for (const candidate of firstOccurrences) {
		if (plannedCount >= normalizedBudget) {
			break;
		}
		selectedByStorageKey.get(candidate.storageKey)?.push(candidate.occurrence);
		plannedCount += 1;
	}

	const remainingOccurrences = selectablePlans
		.flatMap(plan =>
			plan.allOccurrences.slice(1).map(occurrence => ({ storageKey: plan.storageKey, occurrence })),
		)
		.sort(comparePlannedOccurrences);
	for (const candidate of remainingOccurrences) {
		if (plannedCount >= normalizedBudget) {
			break;
		}
		selectedByStorageKey.get(candidate.storageKey)?.push(candidate.occurrence);
		plannedCount += 1;
	}

	for (const plan of entryPlans) {
		plan.selectedOccurrences.sort((left, right) => left.triggerAt.getTime() - right.triggerAt.getTime());
	}

	return {
		entryPlans,
		desiredCount: selectablePlans.reduce((total, plan) => total + plan.allOccurrences.length, 0),
		plannedCount,
		limitedTemplateCount: selectablePlans.filter(
			plan => plan.selectedOccurrences.length < plan.allOccurrences.length,
		).length,
		unplannedTemplateCount: selectablePlans.filter(plan => plan.selectedOccurrences.length === 0).length,
	};
};

const isManagedNotification = (request: Notifications.NotificationRequest) =>
	request.content.data?.notificationSystem === NOTIFICATION_SYSTEM_ID;

const matchesManagedConfig = (
	request: Notifications.NotificationRequest,
	config: Pick<MandatoryReminderConfig, 'accountId' | 'kind' | 'id'>,
) =>
	isManagedNotification(request) &&
	request.content.data?.accountId === config.accountId &&
	request.content.data?.kind === config.kind &&
	request.content.data?.templateId === config.id;

const cancelNotificationIds = async (notificationIds: Iterable<string>) => {
	const uniqueIds = Array.from(new Set(notificationIds));
	await Promise.all(uniqueIds.map(notificationId => Notifications.cancelScheduledNotificationAsync(notificationId)));
};

const cancelEntrySchedules = async (
	entry: ReminderStorageEntry | undefined,
	nativeRequests?: Notifications.NotificationRequest[],
) => {
	if (!entry) {
		return;
	}

	const matchingNativeIds = (nativeRequests ?? (await Notifications.getAllScheduledNotificationsAsync()))
		.filter(request => matchesManagedConfig(request, entry.config))
		.map(request => request.identifier);
	await cancelNotificationIds([...entry.scheduleIds, ...matchingNativeIds]);
	entry.scheduleIds = [];
	entry.nextTriggerAt = null;
	entry.horizonEndAt = null;
};

const cancelAllManagedSchedules = async (nativeRequests?: Notifications.NotificationRequest[]) => {
	const requests = nativeRequests ?? (await Notifications.getAllScheduledNotificationsAsync());
	await cancelNotificationIds(requests.filter(isManagedNotification).map(request => request.identifier));
};

const scheduleEntry = async (
	entry: ReminderStorageEntry,
	nativeRequests?: Notifications.NotificationRequest[],
	plannedOccurrences?: ReminderOccurrence[],
	capacityLimited = false,
): Promise<MandatoryReminderScheduleResult> => {
	await cancelEntrySchedules(entry, nativeRequests);
	const occurrences = plannedOccurrences ?? buildFutureOccurrences(entry.config);
	if (occurrences.length === 0) {
		entry.status = 'no-future';
		return {
			success: false,
			reason: 'invalid-trigger',
			message: 'Não há uma data futura válida dentro do período ativo deste lembrete.',
		};
	}

	if (!(await isMandatoryReminderNotificationChannelEnabled(entry.config.kind))) {
		entry.status = 'channel-disabled';
		return {
			success: false,
			reason: 'channel-disabled',
			message: 'O canal deste lembrete está desativado nas configurações de notificações do Android.',
		};
	}
	const scheduledIds: string[] = [];
	let attemptedNotificationId: string | null = null;

	try {
		for (const occurrence of occurrences) {
			attemptedNotificationId = occurrence.id;
			const notificationId = await Notifications.scheduleNotificationAsync({
				identifier: occurrence.id,
				content: {
					title: occurrence.title,
					body: occurrence.body,
					sound: 'default',
					priority: Notifications.AndroidNotificationPriority.HIGH,
					autoDismiss: true,
					data: {
						notificationSystem: NOTIFICATION_SYSTEM_ID,
						accountId: entry.config.accountId,
						kind: entry.config.kind,
						templateId: entry.config.id,
						cycleKey: occurrence.cycleKey,
						daysBefore: occurrence.daysBefore,
						dueAt: occurrence.dueAt.toISOString(),
					},
				},
				trigger: {
					type: Notifications.SchedulableTriggerInputTypes.DATE,
					date: occurrence.triggerAt,
					...(Platform.OS === 'android'
						? { channelId: getMandatoryReminderChannelConfig(entry.config.kind).id }
						: {}),
				},
			});
			scheduledIds.push(notificationId);
			attemptedNotificationId = null;
		}
	} catch (error) {
		await cancelNotificationIds([
			...scheduledIds,
			...(attemptedNotificationId ? [attemptedNotificationId] : []),
		]);
		entry.scheduleIds = [];
		entry.nextTriggerAt = null;
		entry.horizonEndAt = null;
		entry.status = 'schedule-error';
		throw error;
	}

	const firstOccurrence = occurrences[0];
	const lastOccurrence = occurrences[occurrences.length - 1];
	entry.scheduleIds = scheduledIds;
	entry.nextTriggerAt = firstOccurrence.triggerAt.toISOString();
	entry.horizonEndAt = lastOccurrence.triggerAt.toISOString();
	entry.status = capacityLimited ? 'capacity-limited' : 'scheduled';

	return {
		success: true,
		nextTriggerAt: firstOccurrence.triggerAt,
		horizonEndAt: lastOccurrence.triggerAt,
		scheduledCount: scheduledIds.length,
		title: firstOccurrence.title,
		body: firstOccurrence.body,
		capacityLimited,
	};
};

type ReminderEntryReconciliation = {
	result: MandatoryReminderScheduleResult;
	didSchedule: boolean;
};

const buildSuccessfulScheduleResult = (
	occurrences: ReminderOccurrence[],
	capacityLimited: boolean,
): MandatoryReminderScheduleResult => {
	const firstOccurrence = occurrences[0];
	const lastOccurrence = occurrences[occurrences.length - 1];
	return {
		success: true,
		nextTriggerAt: firstOccurrence.triggerAt,
		horizonEndAt: lastOccurrence.triggerAt,
		scheduledCount: occurrences.length,
		title: firstOccurrence.title,
		body: firstOccurrence.body,
		capacityLimited,
	};
};

const reconcileStoreSchedules = async (
	store: ReminderStore,
	accountId: string,
	nativeRequests?: Notifications.NotificationRequest[],
) => {
	const requests = nativeRequests ?? (await Notifications.getAllScheduledNotificationsAsync());
	const nonManagedScheduleCount = requests.filter(request => !isManagedNotification(request)).length;
	const scheduleLimit = getManagedScheduleLimit();
	const scheduleBudget = Math.max(0, scheduleLimit - nonManagedScheduleCount);
	const accountEntries = Object.values(store.entries).filter(entry => entry.config.accountId === accountId);
	const kindsInStore = new Set(accountEntries.map(entry => entry.config.kind));
	const enabledKinds = new Set<MandatoryReminderKind>();
	for (const kind of ['expense', 'gain'] as const) {
		if (kindsInStore.has(kind) && (await isMandatoryReminderNotificationChannelEnabled(kind))) {
			enabledKinds.add(kind);
		}
	}

	const plan = buildGlobalOccurrencePlan(store, accountId, enabledKinds, scheduleBudget);
	const desiredIds = new Set(
		plan.entryPlans.flatMap(entryPlan => entryPlan.selectedOccurrences.map(occurrence => occurrence.id)),
	);
	const obsoleteManagedIds = requests
		.filter(request => isManagedNotification(request) && !desiredIds.has(request.identifier))
		.map(request => request.identifier);
	await cancelNotificationIds(obsoleteManagedIds);
	const existingDesiredIds = new Set(
		requests
			.filter(request => desiredIds.has(request.identifier) && !obsoleteManagedIds.includes(request.identifier))
			.map(request => request.identifier),
	);
	const entryResults: Record<string, ReminderEntryReconciliation> = {};

	for (const entryPlan of plan.entryPlans) {
		const { storageKey, entry, allOccurrences, selectedOccurrences } = entryPlan;
		entry.fingerprint = buildFingerprint(entry.config);
		if (!enabledKinds.has(entry.config.kind)) {
			entry.scheduleIds = [];
			entry.nextTriggerAt = null;
			entry.horizonEndAt = null;
			entry.status = 'channel-disabled';
			entryResults[storageKey] = {
				didSchedule: false,
				result: {
					success: false,
					reason: 'channel-disabled',
					message: 'O canal deste lembrete está desativado nas configurações de notificações do Android.',
				},
			};
			continue;
		}

		if (allOccurrences.length === 0) {
			entry.scheduleIds = [];
			entry.nextTriggerAt = null;
			entry.horizonEndAt = null;
			entry.status = 'no-future';
			entryResults[storageKey] = {
				didSchedule: false,
				result: {
					success: false,
					reason: 'invalid-trigger',
					message: 'Não há uma data futura válida dentro do período ativo deste lembrete.',
				},
			};
			continue;
		}

		if (selectedOccurrences.length === 0) {
			entry.scheduleIds = [];
			entry.nextTriggerAt = null;
			entry.horizonEndAt = null;
			entry.status = 'capacity-limited';
			entryResults[storageKey] = {
				didSchedule: false,
				result: {
					success: false,
					reason: 'capacity-limit',
					message: 'O limite seguro de lembretes deste dispositivo foi atingido.',
				},
			};
			continue;
		}

		const selectedIds = selectedOccurrences.map(occurrence => occurrence.id);
		const schedulesAreCurrent =
			entry.scheduleIds.length === selectedIds.length &&
			selectedIds.every((notificationId, index) => entry.scheduleIds[index] === notificationId) &&
			selectedIds.every(notificationId => existingDesiredIds.has(notificationId));
		const capacityLimited = selectedOccurrences.length < allOccurrences.length;

		if (schedulesAreCurrent) {
			entry.nextTriggerAt = selectedOccurrences[0].triggerAt.toISOString();
			entry.horizonEndAt = selectedOccurrences[selectedOccurrences.length - 1].triggerAt.toISOString();
			entry.status = capacityLimited ? 'capacity-limited' : 'scheduled';
			entryResults[storageKey] = {
				didSchedule: false,
				result: buildSuccessfulScheduleResult(selectedOccurrences, capacityLimited),
			};
			continue;
		}

		try {
			entryResults[storageKey] = {
				didSchedule: true,
				result: await scheduleEntry(entry, requests, selectedOccurrences, capacityLimited),
			};
		} catch (error) {
			console.error(`Erro ao reconciliar o lembrete ${storageKey}:`, error);
			entry.status = 'schedule-error';
			entryResults[storageKey] = {
				didSchedule: true,
				result: {
					success: false,
					reason: 'schedule-error',
					message: 'Não foi possível criar as datas do lembrete neste dispositivo.',
				},
			};
		}
	}

	return {
		...plan,
		entryResults,
		scheduleLimit,
		nonManagedScheduleCount,
		scheduleBudget,
	};
};

const activateAccountInStore = async (store: ReminderStore, accountId: string | null) => {
	if (store.activeAccountId === accountId) {
		return false;
	}

	await cancelAllManagedSchedules();
	store.entries = {};
	store.activeAccountId = accountId;
	store.lastReconciledAt = null;
	return true;
};

const buildPermissionFailure = (permission: LocalNotificationPermissionResult): MandatoryReminderScheduleResult => ({
	success: false,
	reason: permission.granted ? 'schedule-error' : permission.reason,
	message:
		!permission.granted && permission.reason === 'unavailable'
			? 'As notificações locais só estão disponíveis no Android e no iOS.'
			: 'As notificações do aplicativo estão desativadas para este dispositivo.',
});

export const ensureMandatoryReminderPermission = async (): Promise<MandatoryReminderPermissionResult> =>
	ensureLocalNotificationPermission();

export const scheduleMandatoryReminderNotification = async ({
	accountId,
	kind,
	templateId,
	name,
	dueDay,
	usesBusinessDays,
	reminderHour,
	reminderMinute,
	reminderDaysBefore,
	reminderOnDueDate,
	description,
	lastCompletedCycle,
	activeFromDate,
	activeThroughDate,
	requestPermission = true,
}: {
	accountId: string;
	kind: MandatoryReminderKind;
	templateId: string;
	name: string;
	dueDay: number;
	usesBusinessDays?: boolean;
	reminderHour: number;
	reminderMinute: number;
	reminderDaysBefore?: number;
	reminderOnDueDate?: boolean;
	description?: string | null;
	lastCompletedCycle?: string | null;
	activeFromDate?: Date | string | null;
	activeThroughDate?: Date | string | null;
	requestPermission?: boolean;
}): Promise<MandatoryReminderScheduleResult> => {
	const accountGuard = captureAccountMutationGuard(accountId);
	return runExclusive(async () => {
		if (!isAccountMutationCurrent(accountGuard)) {
			return {
				success: false,
				reason: 'unavailable',
				message: 'A sessão que solicitou este lembrete não está mais ativa.',
			};
		}
		if (!isNotificationsEnvironmentSupported()) {
			return {
				success: false,
				reason: 'unavailable',
				message: 'As notificações locais só estão disponíveis no Android e no iOS.',
			};
		}

		await ensureLegacyNotificationMigration();
		const config = buildConfig({
			accountId,
			kind,
			templateId,
			name,
			dueDay,
			usesBusinessDays,
			reminderHour,
			reminderMinute,
			reminderDaysBefore,
			reminderOnDueDate,
			description,
			lastCompletedCycle,
			activeFromDate,
			activeThroughDate,
		});

		if (!config.accountId || !config.id || !config.name) {
			return {
				success: false,
				reason: 'invalid-trigger',
				message: 'Os dados do lembrete estão incompletos.',
			};
		}

		const store = await readReminderStore();
		await activateAccountInStore(store, config.accountId);
		const storageKey = buildStorageKey(config.accountId, config.kind, config.id);
		const entry: ReminderStorageEntry = {
			fingerprint: buildFingerprint(config),
			config,
			scheduleIds: store.entries[storageKey]?.scheduleIds ?? [],
			nextTriggerAt: store.entries[storageKey]?.nextTriggerAt ?? null,
			horizonEndAt: store.entries[storageKey]?.horizonEndAt ?? null,
			status: 'pending',
		};
		store.entries[storageKey] = entry;
		const permission = await ensureLocalNotificationPermission({ requestIfNeeded: requestPermission });
		if (!isAccountMutationCurrent(accountGuard)) {
			return {
				success: false,
				reason: 'unavailable',
				message: 'A sessão que solicitou este lembrete não está mais ativa.',
			};
		}
		if (!permission.granted) {
			try {
				await cancelEntrySchedules(entry);
			} catch (error) {
				console.error('Erro ao remover a agenda sem permissão de notificações:', error);
			}
			entry.status = 'permission-denied';
			store.lastReconciledAt = new Date().toISOString();
			await writeReminderStore(store);
			return buildPermissionFailure(permission);
		}

		try {
			const reconciliation = await reconcileStoreSchedules(store, config.accountId);
			const result = reconciliation.entryResults[storageKey]?.result ?? {
				success: false as const,
				reason: 'schedule-error' as const,
				message: 'Não foi possível reconciliar este lembrete no dispositivo.',
			};
			store.lastReconciledAt = new Date().toISOString();
			await writeReminderStore(store);
			return result;
		} catch (error) {
			console.error('Erro ao agendar lembrete obrigatório:', error);
			await writeReminderStore(store);
			return {
				success: false,
				reason: 'schedule-error',
				message: 'Não foi possível criar as datas do lembrete neste dispositivo.',
			};
		}
	});
};

export const cancelMandatoryReminderNotification = async (
	accountId: string,
	kind: MandatoryReminderKind,
	templateId: string,
) => {
	const accountGuard = captureAccountMutationGuard(accountId);
	return runExclusive(async () => {
		if (!isAccountMutationCurrent(accountGuard)) {
			return;
		}
		if (!isNotificationsEnvironmentSupported()) {
			return;
		}

		await ensureLegacyNotificationMigration();
		const store = await readReminderStore();
		const storageKey = buildStorageKey(accountId, kind, templateId);
		const entry = store.entries[storageKey];
		const nativeRequests = await Notifications.getAllScheduledNotificationsAsync();

		if (entry) {
			await cancelEntrySchedules(entry, nativeRequests);
			delete store.entries[storageKey];
		} else {
			await cancelNotificationIds(
				nativeRequests
					.filter(request => matchesManagedConfig(request, { accountId, kind, id: templateId }))
					.map(request => request.identifier),
			);
		}
		if (isAccountMutationCurrent(accountGuard) && (await hasLocalNotificationPermission())) {
			try {
				await reconcileStoreSchedules(store, accountId);
			} catch (error) {
				console.error('Erro ao redistribuir a capacidade após cancelar um lembrete:', error);
			}
		}

		await writeReminderStore(store);
	});
};

export const syncMandatoryReminderNotifications = async (
	accountId: string,
	kind: MandatoryReminderKind,
	items: MandatoryReminderSyncItem[],
) => {
	const accountGuard = captureAccountMutationGuard(accountId);
	return runExclusive(async () => {
		if (!isAccountMutationCurrent(accountGuard)) {
			return { scheduled: 0, failed: 0 };
		}
		if (!isNotificationsEnvironmentSupported()) {
			return { scheduled: 0, failed: 0 };
		}

		await ensureLegacyNotificationMigration();
		const store = await readReminderStore();
		await activateAccountInStore(store, accountId);
		const nativeRequests = await Notifications.getAllScheduledNotificationsAsync();
		const permissionGranted = await hasLocalNotificationPermission();
		const expectedKeys = new Set<string>();
		const expectedEnabledTemplateIds = new Set<string>();

		for (const item of items) {
			if (!item.id) {
				continue;
			}

			const storageKey = buildStorageKey(accountId, kind, item.id);
			expectedKeys.add(storageKey);
			if (item.reminderEnabled !== true) {
				if (store.entries[storageKey]) {
					await cancelEntrySchedules(store.entries[storageKey], nativeRequests);
					delete store.entries[storageKey];
				} else {
					await cancelNotificationIds(
						nativeRequests
							.filter(request => matchesManagedConfig(request, { accountId, kind, id: item.id }))
							.map(request => request.identifier),
					);
				}
				continue;
			}
			expectedEnabledTemplateIds.add(item.id);

			const config = buildConfig({
				accountId,
				kind,
				templateId: item.id,
				name: item.name,
				dueDay: item.dueDay,
				usesBusinessDays: item.usesBusinessDays,
				reminderHour: item.reminderHour ?? 9,
				reminderMinute: item.reminderMinute ?? 0,
				reminderDaysBefore: item.reminderDaysBefore,
				reminderOnDueDate: item.reminderOnDueDate,
				description: item.description,
				lastCompletedCycle: item.lastCompletedCycle,
				activeFromDate: item.activeFromDate,
				activeThroughDate: item.activeThroughDate,
			});
			const fingerprint = buildFingerprint(config);
			const currentEntry = store.entries[storageKey];
			const configChanged = currentEntry?.fingerprint !== fingerprint;

			const entry: ReminderStorageEntry = {
				fingerprint,
				config,
				scheduleIds: currentEntry?.scheduleIds ?? [],
				nextTriggerAt: currentEntry?.nextTriggerAt ?? null,
				horizonEndAt: currentEntry?.horizonEndAt ?? null,
				status: configChanged ? 'pending' : currentEntry?.status,
			};
			store.entries[storageKey] = entry;

			if (!permissionGranted && configChanged) {
				await cancelEntrySchedules(entry, nativeRequests);
				entry.status = 'permission-denied';
			}
		}

		for (const [storageKey, entry] of Object.entries(store.entries)) {
			if (
				entry.config.accountId === accountId &&
				entry.config.kind === kind &&
				!expectedKeys.has(storageKey)
			) {
				await cancelEntrySchedules(entry, nativeRequests);
				delete store.entries[storageKey];
			}
		}

		await cancelNotificationIds(
			nativeRequests
				.filter(request => {
					if (
						!isManagedNotification(request) ||
						request.content.data?.accountId !== accountId ||
						request.content.data?.kind !== kind
					) {
						return false;
					}

					const templateId = request.content.data?.templateId;
					return typeof templateId !== 'string' || !expectedEnabledTemplateIds.has(templateId);
				})
				.map(request => request.identifier),
		);
		if (!permissionGranted) {
			store.lastReconciledAt = new Date().toISOString();
			await writeReminderStore(store);
			return { scheduled: 0, failed: 0 };
		}

		const reconciliation = await reconcileStoreSchedules(store, accountId, nativeRequests);
		let scheduled = 0;
		let failed = 0;
		for (const storageKey of expectedKeys) {
			const entry = store.entries[storageKey];
			if (!entry || entry.config.kind !== kind) {
				continue;
			}

			const reconciledEntry = reconciliation.entryResults[storageKey];
			if (!reconciledEntry) {
				continue;
			}
			if (reconciledEntry.result.success) {
				if (reconciledEntry.didSchedule) {
					scheduled += 1;
				}
			} else {
				failed += 1;
			}
		}

		store.lastReconciledAt = new Date().toISOString();
		await writeReminderStore(store);
		return { scheduled, failed };
	});
};

export const suppressMandatoryReminderCycle = async (
	accountId: string,
	kind: MandatoryReminderKind,
	templateId: string,
	cycleKey: string,
) => {
	const accountGuard = captureAccountMutationGuard(accountId);
	return runExclusive(async () => {
		if (!isAccountMutationCurrent(accountGuard)) {
			return;
		}
		const normalizedCycleKey = normalizeCycleKey(cycleKey);
		if (!normalizedCycleKey || !isNotificationsEnvironmentSupported()) {
			return;
		}

		await ensureLegacyNotificationMigration();
		const store = await readReminderStore();
		const storageKey = buildStorageKey(accountId, kind, templateId);
		const entry = store.entries[storageKey];
		const nativeRequests = await Notifications.getAllScheduledNotificationsAsync();
		if (!entry) {
			await cancelNotificationIds(
				nativeRequests
					.filter(
						request =>
							matchesManagedConfig(request, { accountId, kind, id: templateId }) &&
							request.content.data?.cycleKey === normalizedCycleKey,
					)
					.map(request => request.identifier),
			);
			if (isAccountMutationCurrent(accountGuard) && (await hasLocalNotificationPermission())) {
				try {
					await reconcileStoreSchedules(store, accountId);
					await writeReminderStore(store);
				} catch (error) {
					console.error('Erro ao redistribuir a capacidade após suprimir um ciclo órfão:', error);
				}
			}
			return;
		}

		entry.config.lastCompletedCycle = normalizedCycleKey;
		entry.fingerprint = buildFingerprint(entry.config);
		const deterministicCycleIds = buildMandatoryReminderOffsets(
			entry.config.reminderDaysBefore,
			entry.config.reminderOnDueDate,
		).map(daysBefore => buildNotificationId(entry.config, normalizedCycleKey, daysBefore));
		const nativeCycleIds = nativeRequests
			.filter(
				request =>
					matchesManagedConfig(request, entry.config) &&
					request.content.data?.cycleKey === normalizedCycleKey,
			)
			.map(request => request.identifier);
		const suppressedIds = new Set([...deterministicCycleIds, ...nativeCycleIds]);
		await cancelNotificationIds(suppressedIds);
		entry.scheduleIds = entry.scheduleIds.filter(notificationId => !suppressedIds.has(notificationId));
		if (isAccountMutationCurrent(accountGuard) && (await hasLocalNotificationPermission())) {
			try {
				await reconcileStoreSchedules(store, accountId);
			} catch (error) {
				console.error('Erro ao redistribuir a capacidade após concluir o ciclo:', error);
			}
		}
		store.lastReconciledAt = new Date().toISOString();
		await writeReminderStore(store);
	});
};

export const refreshMandatoryReminderNotifications = async (accountId: string, force = false) => {
	const accountGuard = captureAccountMutationGuard(accountId);
	return runExclusive(async () => {
		if (!isAccountMutationCurrent(accountGuard)) {
			return;
		}
		if (!isNotificationsEnvironmentSupported()) {
			return;
		}

		await ensureLegacyNotificationMigration();
		const store = await readReminderStore();
		const accountChanged = await activateAccountInStore(store, accountId);
		const lastReconciledAt = store.lastReconciledAt ? new Date(store.lastReconciledAt).getTime() : 0;
		if (!(await hasLocalNotificationPermission())) {
			await writeReminderStore(store);
			return;
		}

		const nativeRequests = await Notifications.getAllScheduledNotificationsAsync();
		const nativeIds = new Set(nativeRequests.map(request => request.identifier));
		const hasMissingSchedules = Object.values(store.entries).some(
			entry => {
				if (entry.config.accountId !== accountId) {
					return false;
				}
				if (entry.fingerprint !== buildFingerprint(entry.config)) {
					return true;
				}
				if (
					entry.status === 'pending' ||
					entry.status === 'permission-denied' ||
					entry.status === 'channel-disabled' ||
					entry.status === 'schedule-error'
				) {
					return true;
				}
				if (entry.status === 'capacity-limited') {
					return true;
				}
				if (entry.status === 'no-future') {
					return false;
				}
				return (
					entry.scheduleIds.length === 0 ||
					entry.scheduleIds.some(notificationId => !nativeIds.has(notificationId))
				);
			},
		);
		const shouldRefresh =
			force ||
			accountChanged ||
			hasMissingSchedules ||
			!lastReconciledAt ||
			Date.now() - lastReconciledAt >= RECONCILIATION_INTERVAL_MS;

		if (!shouldRefresh) {
			await writeReminderStore(store);
			return;
		}

		await reconcileStoreSchedules(store, accountId, nativeRequests);

		store.lastReconciledAt = new Date().toISOString();
		await writeReminderStore(store);
	});
};

export const getMandatoryReminderCapacityDiagnostics = () =>
	runExclusive(async () => {
		if (!isNotificationsEnvironmentSupported()) {
			return {
				scheduleLimit: 0,
				nonManagedScheduleCount: 0,
				scheduleBudget: 0,
				desiredCount: 0,
				plannedCount: 0,
				limitedTemplateCount: 0,
				unplannedTemplateCount: 0,
			};
		}

		await ensureLegacyNotificationMigration();
		const [store, nativeRequests] = await Promise.all([
			readReminderStore(),
			Notifications.getAllScheduledNotificationsAsync(),
		]);
		const scheduleLimit = getManagedScheduleLimit();
		const nonManagedScheduleCount = nativeRequests.filter(request => !isManagedNotification(request)).length;
		const scheduleBudget = Math.max(0, scheduleLimit - nonManagedScheduleCount);
		const accountId = store.activeAccountId;
		const plan = accountId
			? buildGlobalOccurrencePlan(
					store,
					accountId,
					new Set<MandatoryReminderKind>(['expense', 'gain']),
					scheduleBudget,
				)
			: {
					desiredCount: 0,
					plannedCount: 0,
					limitedTemplateCount: 0,
					unplannedTemplateCount: 0,
				};

		return {
			scheduleLimit,
			nonManagedScheduleCount,
			scheduleBudget,
			desiredCount: plan.desiredCount,
			plannedCount: plan.plannedCount,
			limitedTemplateCount: plan.limitedTemplateCount,
			unplannedTemplateCount: plan.unplannedTemplateCount,
		};
	});

export const setActiveMandatoryReminderAccount = async (accountId: string) => {
	const normalizedAccountId = accountId.trim();
	if (!normalizedAccountId) {
		return;
	}
	setRuntimeActiveAccount(normalizedAccountId);
	await refreshMandatoryReminderNotifications(normalizedAccountId);
};

export const clearMandatoryReminderAccount = (accountId: string): Promise<boolean> => {
	const normalizedAccountId = accountId.trim();
	if (
		!normalizedAccountId ||
		(runtimeActiveAccountId !== undefined && runtimeActiveAccountId !== normalizedAccountId)
	) {
		return Promise.resolve(false);
	}

	const clearEpoch = setRuntimeActiveAccount(null);
	return runExclusive(async () => {
		if (runtimeAccountEpoch !== clearEpoch || runtimeActiveAccountId !== null) {
			return false;
		}
		if (!isNotificationsEnvironmentSupported()) {
			return true;
		}

		await ensureLegacyNotificationMigration();
		if (runtimeAccountEpoch !== clearEpoch || runtimeActiveAccountId !== null) {
			return false;
		}

		const store = await readReminderStore();
		if (runtimeAccountEpoch !== clearEpoch || runtimeActiveAccountId !== null) {
			return false;
		}
		if (store.activeAccountId && store.activeAccountId !== normalizedAccountId) {
			setRuntimeActiveAccount(store.activeAccountId);
			return false;
		}

		// O logout explícito também precisa limpar alarmes órfãos caso o AsyncStorage
		// tenha sido apagado ou corrompido enquanto a agenda nativa sobreviveu.
		await cancelAllManagedSchedules();
		if (runtimeAccountEpoch !== clearEpoch || runtimeActiveAccountId !== null) {
			return false;
		}

		for (const entry of Object.values(store.entries)) {
			if (entry.config.accountId === normalizedAccountId) {
				entry.scheduleIds = [];
				entry.nextTriggerAt = null;
				entry.horizonEndAt = null;
			}
		}
		// As configurações ficam como rollback local até o Firebase confirmar o signOut.
		// O navigator chama finalizeMandatoryReminderAccountCleanup() logo após o sucesso.
		store.activeAccountId = normalizedAccountId;
		store.lastReconciledAt = null;
		await writeReminderStore(store);
		return true;
	});
};

export const finalizeMandatoryReminderAccountCleanup = (accountId: string) => {
	const normalizedAccountId = accountId.trim();
	if (!normalizedAccountId) {
		return Promise.resolve(false);
	}

	return runExclusive(async () => {
		if (runtimeActiveAccountId !== null) {
			return false;
		}
		if (!isNotificationsEnvironmentSupported()) {
			return true;
		}

		const store = await readReminderStore();
		if (runtimeActiveAccountId !== null || store.activeAccountId !== normalizedAccountId) {
			return false;
		}

		store.entries = {};
		store.activeAccountId = null;
		store.lastReconciledAt = null;
		await writeReminderStore(store);
		return true;
	});
};

export const formatMandatoryReminderNextTrigger = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(date);
