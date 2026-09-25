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

type PaginationDockProps = {
	groups: AssistantDraftGroup[];
	drafts: AssistantDraftAction[];
	selectedActionByGroup: Record<string, string | undefined>;
	activeQuestionActionId?: string;
	onSelect(groupId: string, actionId: string): void;
};

/** Pagination stays beside the composer while its selected card remains in the chat. */
export const AssistantPaginationDock = ({
	groups, drafts, selectedActionByGroup, activeQuestionActionId, onSelect,
}: PaginationDockProps) => {
	const paginatedGroups = groups.filter(group => group.actionIds.length > 1);
	if (paginatedGroups.length === 0) return null;

	return (
		<View className={ASSISTANT_CLASS_NAMES.paginationDock}>
			<View className={ASSISTANT_CLASS_NAMES.paginationDockInner}>
				<Text bold size="xs" className={ASSISTANT_CLASS_NAMES.paginationDockTitle}>Ações propostas</Text>
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
						const selectedActionId = activeQuestionIsInGroup
							? activeQuestionActionId
							: selectedActionByGroup[group.id];
						const selectedIndex = Math.max(0, actions.findIndex(action => action.clientActionId === selectedActionId));
						const completed = actions.filter(action => action.status === 'succeeded').length;

						return (
							<View key={group.id} className={ASSISTANT_CLASS_NAMES.paginationDockRow}>
								<Text size="xs" className={ASSISTANT_CLASS_NAMES.paginationDockMeta}>
									Ação {selectedIndex + 1} de {actions.length} · {completed} concluída{completed === 1 ? '' : 's'}
								</Text>
								<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
									{actions.map((action, index) => {
										const selected = index === selectedIndex;
										const statusMark = action.status === 'succeeded' ? ' ✓' : action.status === 'cancelled' ? ' ×' : '';
										const statusLabel = action.status === 'succeeded' ? ', concluída' : action.status === 'cancelled' ? ', cancelada' : '';
										return (
											<Pressable
												key={action.clientActionId}
												accessibilityRole="button"
												accessibilityLabel={`Ver ação ${index + 1} de ${actions.length}${statusLabel}`}
												accessibilityState={{ selected, disabled: activeQuestionIsInGroup && !selected }}
												disabled={activeQuestionIsInGroup && !selected}
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
	drafts: AssistantDraftAction[];
	catalog: AssistantResolvedCatalog;
	isDarkMode: boolean;
	hideValues: boolean;
	onEdit(actionId: string, patch: Record<string, unknown>): Promise<void>;
	onReview(actionId: string): void;
	onBack(actionId: string): void;
	onConfirm(actionId: string): Promise<void>;
	onCancel(actionId: string): void;
};

export const AssistantDraftPages = ({
	actionIds, selectedActionId, drafts, catalog, isDarkMode, hideValues,
	onEdit, onReview, onBack, onConfirm, onCancel,
}: DraftPagesProps) => {
	const actions = actionIds
		.map(id => drafts.find(draft => draft.clientActionId === id))
		.filter((draft): draft is AssistantDraftAction => Boolean(draft));
	const selectedIndex = Math.max(0, actions.findIndex(draft => draft.clientActionId === selectedActionId));
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
