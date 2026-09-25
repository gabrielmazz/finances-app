import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Check, ChevronDown, ChevronUp, Circle } from 'lucide-react-native';

import { HStack } from '@/components/ui/hstack';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';
import { LUMUS_RUNTIME_COLORS } from '@/design-system/tokens';
import type { AssistantSendProgress, AssistantSendStage } from '@/types/lumusAssistant';

const STAGE_LABELS: Record<AssistantSendStage, string> = {
	loading_data: 'Consultando os dados necessários',
	interpreting_request: 'Interpretando seu pedido',
	preparing_actions: 'Preparando cartões para sua revisão',
	building_report: 'Montando seu relatório',
	writing_report: 'Preparando o resumo do relatório',
};

type AssistantActivityTraceProps = {
	progress: AssistantSendProgress;
	theme: 'dark' | 'light';
};

export const AssistantActivityTrace = ({ progress, theme }: AssistantActivityTraceProps) => {
	const [isExpanded, setIsExpanded] = React.useState(true);
	const steps = [...progress.completed, progress.active];

	return (
		<VStack className={ASSISTANT_CLASS_NAMES.activityTrace}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={isExpanded ? 'Ocultar etapas do Lumus' : 'Ver etapas do Lumus'}
				accessibilityState={{ expanded: isExpanded }}
				onPress={() => setIsExpanded(value => !value)}
				className={ASSISTANT_CLASS_NAMES.activityTraceToggle}
			>
				<ActivityIndicator size="small" color={LUMUS_RUNTIME_COLORS[theme].accentStrong} />
				<VStack className="min-w-0 flex-1" space="xs">
					<Text bold size="sm" className="text-slate-800 dark:text-slate-100">
						O que o Lumus está fazendo
					</Text>
					<Text
						accessibilityLiveRegion="polite"
						size="sm"
						className="text-slate-600 dark:text-slate-300"
					>
						{STAGE_LABELS[progress.active]}
					</Text>
				</VStack>
				<Icon
					as={isExpanded ? ChevronUp : ChevronDown}
					size="sm"
					className="text-slate-500 dark:text-slate-400"
				/>
			</Pressable>

			{isExpanded ? (
				<VStack className={ASSISTANT_CLASS_NAMES.activityTraceSteps}>
					{steps.map((stage, index) => {
						const isActive = stage === progress.active && index === steps.length - 1;
						return (
							<HStack key={`${stage}-${index}`} className={ASSISTANT_CLASS_NAMES.activityTraceStep}>
								<Icon
									as={isActive ? Circle : Check}
									size="xs"
									className={isActive ? 'text-yellow-600 dark:text-yellow-300' : 'text-emerald-600 dark:text-emerald-400'}
								/>
								<Text size="xs" className={isActive ? 'flex-1 text-slate-700 dark:text-slate-200' : 'flex-1 text-slate-500 dark:text-slate-400'}>
									{STAGE_LABELS[stage]}
								</Text>
								{isActive ? (
									<Text size="xs" className="text-yellow-700 dark:text-yellow-300">Em andamento</Text>
								) : null}
							</HStack>
						);
					})}
				</VStack>
			) : null}
		</VStack>
	);
};
