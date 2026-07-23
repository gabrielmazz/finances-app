export const ASSISTANT_ACTION_KINDS = [
	'create_expense',
	'update_expense',
	'delete_expense',
	'create_gain',
	'update_gain',
	'delete_gain',
	'upsert_monthly_balance',
	'create_transfer',
	'create_cash_withdrawal',
	'undo_cash_withdrawal',
	'create_mandatory_expense',
	'update_mandatory_expense',
	'delete_mandatory_expense',
	'pay_mandatory_expense',
	'undo_mandatory_expense_payment',
	'create_mandatory_gain',
	'update_mandatory_gain',
	'delete_mandatory_gain',
	'receive_mandatory_gain',
	'undo_mandatory_gain_receipt',
	'create_investment',
	'update_investment',
	'delete_investment',
	'deposit_investment',
	'redeem_investment',
	'sync_investment',
	'undo_investment_deposit',
	'undo_investment_redemption',
	'undo_investment_sync',
	'upsert_cdi_rate',
	'create_bank',
	'update_bank',
	'delete_bank',
	'create_category',
	'update_category',
	'delete_category',
] as const;

export type AssistantActionKind = (typeof ASSISTANT_ACTION_KINDS)[number];

export const ASSISTANT_DRAFT_STATUSES = [
	'draft',
	'needs_input',
	'ready',
	'confirming',
	'executing',
	'succeeded',
	'failed',
	'cancelled',
	'stale',
] as const;

export type AssistantDraftStatus = (typeof ASSISTANT_DRAFT_STATUSES)[number];

export type AssistantFieldKind =
	| 'text'
	| 'money'
	| 'date'
	| 'time'
	| 'month'
	| 'number'
	| 'boolean'
	| 'bank'
	| 'category'
	| 'record'
	| 'investment'
	| 'choice';

export type AssistantMissingField = {
	key: string;
	label: string;
	kind: AssistantFieldKind;
	question: string;
	choiceSource?: AssistantCatalogType;
	choices?: AssistantChoiceOption[];
	allowApplyToSimilar?: boolean;
};

export type AssistantRecordSnapshot = {
	collection: string;
	recordHandle: string;
	fingerprint: string;
	capturedAt: string;
};

export type AssistantNotificationRetry = {
	operation: 'sync' | 'cancel' | 'suppress_cycle';
	recurringType: 'expense' | 'gain';
	templateId: string;
	cycle?: string;
};

export type AssistantDraftAction = {
	clientActionId: string;
	kind: AssistantActionKind;
	status: AssistantDraftStatus;
	payload: Record<string, unknown>;
	missingFields: AssistantMissingField[];
	warnings: string[];
	dependsOnActionIds: string[];
	originalSnapshot?: AssistantRecordSnapshot;
	preparedAt: string;
	result?: {
		recordHandle?: string;
		message: string;
		notificationWarning?: string;
		notificationRetry?: AssistantNotificationRetry;
	};
	error?: string;
};

export type AssistantChoiceOption = {
	/** Identificador opaco e temporário. IDs reais do Firestore nunca entram no prompt. */
	value: string;
	label: string;
	description?: string;
	disabled?: boolean;
};

export type AssistantCatalogType =
	| 'banks'
	| 'expenseCategories'
	| 'gainCategories'
	| 'mandatoryExpenseCategories'
	| 'mandatoryGainCategories'
	| 'investments'
	| 'expenses'
	| 'gains'
	| 'cashWithdrawals'
	| 'mandatoryExpenses'
	| 'mandatoryGains'
	| 'investmentDeposits'
	| 'investmentRedemptions'
	| 'investmentSyncs'
	| 'categories';

export type AssistantModelCatalogItem = {
	handle: string;
	label: string;
	description?: string;
	ownerScope?: 'current_user' | 'related_read_only';
};

export type AssistantModelCatalog = Partial<
	Record<AssistantCatalogType, AssistantModelCatalogItem[]>
>;

export type AssistantResolvedCatalogItem = AssistantModelCatalogItem & {
	realId: string | null;
	collection?: string;
	data?: Record<string, unknown>;
};

export type AssistantResolvedCatalog = Partial<
	Record<AssistantCatalogType, AssistantResolvedCatalogItem[]>
>;

export type AssistantConversationTurn = {
	role: 'user' | 'assistant';
	text: string;
	createdAt: string;
};

export type AssistantReportKind =
	| 'monthly_overview'
	| 'bank_movements'
	| 'cash_movements'
	| 'transaction_search'
	| 'category_analysis'
	| 'cash_flow_forecast'
	| 'pending_obligations'
	| 'investment_portfolio';

export type AssistantReportRequest = {
	kind: AssistantReportKind;
	period?: string;
	bankRef?: string;
	categoryRef?: string;
	query?: string;
};

export type AssistantChartKind = 'line' | 'bar' | 'donut';

export type AssistantChartPoint = {
	label: string;
	value: number;
	color?: string;
};

export type AssistantReportMetric = {
	label: string;
	valueInCents?: number;
	value?: number;
	displayValue?: string;
	tone?: 'positive' | 'negative' | 'neutral' | 'warning';
};

export type AssistantReport = {
	id: string;
	kind: AssistantReportKind;
	title: string;
	periodLabel: string;
	scopeLabel: string;
	updatedAt: string;
	metrics: AssistantReportMetric[];
	chart?: {
		kind: AssistantChartKind;
		points: AssistantChartPoint[];
	};
	deterministicSummary: string;
	narrative?: string;
	notes: string[];
};

type AssistantMessageBase = {
	id: string;
	role: 'user' | 'assistant' | 'system';
	createdAt: string;
};

export type AssistantMessage =
	| (AssistantMessageBase & {
			type: 'text';
			text: string;
	  })
	| (AssistantMessageBase & {
			type: 'question';
			text: string;
			field: AssistantMissingField;
			targetActionIds: string[];
			answeredAt?: string;
			answerLabel?: string;
	  })
	| (AssistantMessageBase & {
			type: 'draft';
			actionId: string;
	  })
	| (AssistantMessageBase & {
			type: 'report';
			report: AssistantReport;
	  })
	| (AssistantMessageBase & {
			type: 'success' | 'warning' | 'error';
			text: string;
			actionId?: string;
	  });

export type AssistantModelActionProposal = {
	clientActionId?: string;
	kind: AssistantActionKind;
	payload: Record<string, unknown>;
	dependsOnActionIds?: string[];
};

export type AssistantAiConfig = {
	enabled: boolean;
	model: string;
	maxContextTurns: number;
	maxActionsPerResponse: number;
	maxToolCalls: number;
	maxRequestsPerMinute: number;
};

export type AssistantAiAvailability = {
	available: boolean;
	platform: 'web' | 'android' | 'unsupported';
	appCheckConfigured: boolean;
	remoteConfigLoaded: boolean;
	model: string;
	reason?: string;
};

export type AssistantAiConversationRequest = {
	/** Escopo local de cota; nunca é enviado ao modelo. */
	requestScope?: string;
	text: string;
	turns: AssistantConversationTurn[];
	activeSummary?: string;
	catalog: AssistantModelCatalog;
	nowIso: string;
	timeZone: 'America/Sao_Paulo';
	config: AssistantAiConfig;
	signal?: AbortSignal;
};

export type AssistantAiConversationResponse = {
	text: string;
	actions: AssistantModelActionProposal[];
	reportRequest?: AssistantReportRequest;
	toolCallCount: number;
};

export type AssistantTranscriptionRequest = {
	/** Escopo local de cota; nunca é enviado ao modelo. */
	requestScope?: string;
	base64Audio: string;
	mimeType: string;
	durationMs: number;
	config: AssistantAiConfig;
	signal?: AbortSignal;
};

export type AssistantReportNarrationRequest = {
	/** Escopo local de cota; nunca é enviado ao modelo. */
	requestScope?: string;
	report: Pick<
		AssistantReport,
		'kind' | 'title' | 'periodLabel' | 'scopeLabel' | 'metrics' | 'deterministicSummary' | 'notes'
	>;
	config: AssistantAiConfig;
	signal?: AbortSignal;
};

export interface AssistantAiGateway {
	getConfig(forceRefresh?: boolean): Promise<AssistantAiConfig>;
	getAvailability(): Promise<AssistantAiAvailability>;
	converse(request: AssistantAiConversationRequest): Promise<AssistantAiConversationResponse>;
	transcribe(request: AssistantTranscriptionRequest): Promise<string>;
	narrateReport(request: AssistantReportNarrationRequest): Promise<string>;
}

export type AssistantPrepareActionsResult = {
	actions: AssistantDraftAction[];
	catalog: AssistantResolvedCatalog;
};

export type AssistantExecuteResult = {
	success: boolean;
	message: string;
	recordHandle?: string;
	notificationWarning?: string;
	notificationRetry?: AssistantNotificationRetry;
	errorCode?: string;
};

export interface FinanceCommandService {
	loadCatalog(personId: string): Promise<AssistantResolvedCatalog>;
	prepareActions(
		personId: string,
		proposals: AssistantModelActionProposal[],
		catalog?: AssistantResolvedCatalog,
	): Promise<AssistantPrepareActionsResult>;
	updateDraft(
		personId: string,
		draft: AssistantDraftAction,
		patch: Record<string, unknown>,
		catalog: AssistantResolvedCatalog,
	): Promise<AssistantDraftAction>;
	execute(personId: string, draft: AssistantDraftAction, catalog: AssistantResolvedCatalog): Promise<AssistantExecuteResult>;
	retryNotification(personId: string, draft: AssistantDraftAction, catalog: AssistantResolvedCatalog): Promise<AssistantExecuteResult>;
}

export interface AssistantReportService {
	createReport(
		personId: string,
		request: AssistantReportRequest,
		catalog: AssistantResolvedCatalog,
	): Promise<AssistantReport>;
}

export interface AssistantSessionStore {
	messages: AssistantMessage[];
	drafts: AssistantDraftAction[];
	consentGranted: boolean;
	autoReadEnabled: boolean;
	clear(): void;
}
