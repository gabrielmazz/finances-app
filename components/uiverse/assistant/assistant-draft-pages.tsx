import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { AssistantDraftCard } from '@/components/uiverse/assistant/assistant-cards';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';
import type { AssistantDraftAction, AssistantResolvedCatalog } from '@/types/lumusAssistant';

export type AssistantDraftGroup = {
	id: string;
	actionIds: string[];
};

export const getActiveAssistantDraftActionId = (
	actionIds: string[],
	drafts: AssistantDraftAction[],
	activeQuestionActionId?: string,
) => {
	if (activeQuestionActionId && actionIds.includes(activeQuestionActionId)) return activeQuestionActionId;

	const actions = actionIds
		.map(id => drafts.find(draft => draft.clientActionId === id))
		.filter((draft): draft is AssistantDraftAction => Boolean(draft));
	const pendingActions = actions.filter(action => !['succeeded', 'cancelled'].includes(action.status));
	const nextAvailableAction = pendingActions.find(action =>
		action.dependsOnActionIds.every(id => drafts.find(draft => draft.clientActionId === id)?.status === 'succeeded'),
	);

	return (nextAvailableAction ?? pendingActions[0] ?? actions[actions.length - 1])?.clientActionId;
};

export const getDisplayedAssistantDraftActionId = (
	actionIds: string[],
	drafts: AssistantDraftAction[],
	selectedActionId?: string,
	activeQuestionActionId?: string,
) => {
	const activeActionId = getActiveAssistantDraftActionId(actionIds, drafts, activeQuestionActionId);
	if (activeQuestionActionId && actionIds.includes(activeQuestionActionId)) return activeActionId;

	const actions = actionIds
		.map(id => drafts.find(draft => draft.clientActionId === id))
		.filter((draft): draft is AssistantDraftAction => Boolean(draft));
	const activeIndex = actions.findIndex(action => action.clientActionId === activeActionId);
	const selectedIndex = actions.findIndex(action => action.clientActionId === selectedActionId);
	const selectedAction = actions[selectedIndex];

	if (
		selectedIndex >= 0 &&
		selectedIndex <= activeIndex &&
		(selectedIndex === activeIndex || selectedAction?.status === 'succeeded')
	) return selectedActionId;

	return activeActionId;
};

export const isAssistantDraftGroupActive = (group: AssistantDraftGroup, drafts: AssistantDraftAction[]) => {
	if (group.actionIds.length < 2) return false;
	const actions = group.actionIds
		.map(id => drafts.find(draft => draft.clientActionId === id))
		.filter((draft): draft is AssistantDraftAction => Boolean(draft));
	return actions.length > 1 && actions.some(action => !['succeeded', 'cancelled'].includes(action.status));
};

type PaginationDockProps = {
	groups: AssistantDraftGroup[];
	drafts: AssistantDraftAction[];
	selectedActionByGroup: Record<string, string | undefined>;
	activeQuestionActionId?: string;
	advancingActionGroupIds: string[];
	onSelect(groupId: string, actionId: string): void;
};

/** Pagination stays beside the composer while its selected card remains in the chat. */
export const AssistantPaginationDock = ({
	groups, drafts, selectedActionByGroup, activeQuestionActionId, advancingActionGroupIds, onSelect,
}: PaginationDockProps) => {
	const paginatedGroups = groups.filter(group => isAssistantDraftGroupActive(group, drafts));
	if (paginatedGroups.length === 0) return null;

	return (
		<View className={ASSISTANT_CLASS_NAMES.paginationDock}>
			<View className={ASSISTANT_CLASS_NAMES.paginationDockInner}>
				<Text bold size="xs" className={ASSISTANT_CLASS_NAMES.paginationDockTitle}>Confirme uma ação por vez</Text>
				<ScrollView
					className={`${ASSISTANT_CLASS_NAMES.paginationDockGroups} max-h-28`}
					showsVerticalScrollIndicator={false}
					keyboardShouldPersistTaps="handled"
				>
					{paginatedGroups.map(group => {
						const actions = group.actionIds
							.map(id => drafts.find(draft => draft.clientActionId === id))
							.filter((draft): draft is AssistantDraftAction => Boolean(draft));
						if (actions.length < 2) return null;
						const activeQuestionIsInGroup = group.actionIds.includes(activeQuestionActionId ?? '');
						const activeActionId = getActiveAssistantDraftActionId(group.actionIds, drafts, activeQuestionActionId);
						const selectedActionId = getDisplayedAssistantDraftActionId(
							group.actionIds,
							drafts,
							selectedActionByGroup[group.id],
							activeQuestionActionId,
						);
						const activeIndex = Math.max(0, actions.findIndex(action => action.clientActionId === activeActionId));
						const selectedIndex = Math.max(0, actions.findIndex(action => action.clientActionId === selectedActionId));
						const completed = actions.filter(action => action.status === 'succeeded').length;
						const isAdvancing = advancingActionGroupIds.includes(group.id);

						return (
							<View key={group.id} className={ASSISTANT_CLASS_NAMES.paginationDockRow}>
								<Text accessibilityLiveRegion="polite" size="xs" className={ASSISTANT_CLASS_NAMES.paginationDockMeta}>
									{isAdvancing
										? `Ação ${selectedIndex + 1} concluída · preparando a próxima`
										: `Ação ${activeIndex + 1} de ${actions.length} · ${completed} concluída${completed === 1 ? '' : 's'}`}
								</Text>
								<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
									{actions.map((action, index) => {
										const selected = index === selectedIndex;
										const isCurrent = index === activeIndex;
										const canRevisitCompleted = index < activeIndex && action.status === 'succeeded';
										const isDisabled = isAdvancing || (activeQuestionIsInGroup && !isCurrent) || (!isCurrent && !canRevisitCompleted);
										const statusMark = action.status === 'succeeded' ? ' ✓' : action.status === 'cancelled' ? ' ×' : '';
										const statusLabel = action.status === 'succeeded'
											? ', concluída'
											: action.status === 'cancelled'
												? ', cancelada'
													: isDisabled ? ', aguarda a confirmação da ação anterior' : '';
										return (
											<Pressable
												key={action.clientActionId}
												accessibilityRole="button"
												accessibilityLabel={`Ver ação ${index + 1} de ${actions.length}${statusLabel}`}
												accessibilityState={{ selected, disabled: isDisabled }}
												disabled={isDisabled}
												onPress={() => onSelect(group.id, action.clientActionId)}
												className={selected ? ASSISTANT_CLASS_NAMES.draftPagerButtonActive : ASSISTANT_CLASS_NAMES.draftPagerButton}
											>
												<Text bold className={selected ? 'text-lumus-on-accent' : ASSISTANT_CLASS_NAMES.choiceText}>{index + 1}{statusMark}</Text>
											</Pressable>
										);
									})}
								</ScrollView>
							</View>
						);
					})}
				</ScrollView>
			</View>
		</View>
	);
};

type DraftPagesProps = {
	actionIds: string[];
	selectedActionId?: string;
	activeQuestionActionId?: string;
	drafts: AssistantDraftAction[];
	catalog: AssistantResolvedCatalog;
	isDarkMode: boolean;
	hideValues: boolean;
	onEdit(actionId: string, patch: Record<string, unknown>): Promise<void>;
	onReview(actionId: string): void;
	onBack(actionId: string): void;
	onConfirm(actionId: string): Promise<boolean>;
	onCancel(actionId: string): void;
};

export const AssistantDraftPages = ({
	actionIds, selectedActionId, activeQuestionActionId, drafts, catalog, isDarkMode, hideValues,
	onEdit, onReview, onBack, onConfirm, onCancel,
}: DraftPagesProps) => {
	const actions = actionIds
		.map(id => drafts.find(draft => draft.clientActionId === id))
		.filter((draft): draft is AssistantDraftAction => Boolean(draft));
	const displayedActionId = getDisplayedAssistantDraftActionId(actionIds, drafts, selectedActionId, activeQuestionActionId);
	const selectedIndex = Math.max(0, actions.findIndex(draft => draft.clientActionId === displayedActionId));
	const draft = actions[selectedIndex];
	if (!draft) return null;

	const isDependencyPending = draft.dependsOnActionIds.some(id =>
		drafts.find(item => item.clientActionId === id)?.status !== 'succeeded',
	);

	return (
		<View className={ASSISTANT_CLASS_NAMES.draftPager}>
			<AssistantDraftCard
				key={draft.clientActionId}
				draft={draft}
				catalog={catalog}
				isDarkMode={isDarkMode}
				hideValues={hideValues}
				isDependencyPending={isDependencyPending}
				onEdit={patch => onEdit(draft.clientActionId, patch)}
				onReview={() => onReview(draft.clientActionId)}
				onBack={() => onBack(draft.clientActionId)}
				onConfirm={() => onConfirm(draft.clientActionId)}
				onCancel={() => onCancel(draft.clientActionId)}
			/>
		</View>
	);
};
