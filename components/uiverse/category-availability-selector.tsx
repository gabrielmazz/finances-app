import React from 'react';
import { View } from 'react-native';
import { Check, CircleDollarSign, Repeat2, TrendingUp, WalletCards } from 'lucide-react-native';

import {
	Actionsheet,
	ActionsheetBackdrop,
	ActionsheetContent,
	ActionsheetDragIndicator,
	ActionsheetDragIndicatorWrapper,
	ActionsheetItem,
	ActionsheetItemText,
	ActionsheetScrollView,
} from '@/components/ui/actionsheet';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import {
	categoryAvailabilityPresetOptions,
	categoryPlacementOptions,
	type CategoryAvailabilityPreset,
	type CategoryPlacement,
} from '@/utils/categoryAvailability';

type CategoryAvailabilitySelectorProps = {
	mode: 'placement' | 'preset';
	isOpen: boolean;
	onClose: () => void;
	onSelect: (value: CategoryPlacement | CategoryAvailabilityPreset) => void;
	selectedValue?: CategoryPlacement | CategoryAvailabilityPreset | null;
	isDarkMode: boolean;
};

const getOptionIcon = (id: CategoryPlacement | CategoryAvailabilityPreset) => {
	switch (id) {
		case 'expense':
			return WalletCards;
		case 'mandatory-expense':
			return Repeat2;
		case 'gain':
			return TrendingUp;
		case 'mandatory-gain':
			return CircleDollarSign;
		default:
			return Repeat2;
	}
};

export default function CategoryAvailabilitySelector({
	mode,
	isOpen,
	onClose,
	onSelect,
	selectedValue = null,
	isDarkMode,
}: CategoryAvailabilitySelectorProps) {
	const options = mode === 'placement' ? categoryPlacementOptions : categoryAvailabilityPresetOptions;
	const title = mode === 'placement' ? 'Onde você vai usar esta categoria?' : 'Onde esta categoria aparece?';
	const description =
		mode === 'placement'
			? 'Escolha o primeiro uso. Você poderá ampliar isso depois na edição.'
			: 'Escolha uma opção simples para atualizar a disponibilidade da categoria.';
	const textClassName = isDarkMode ? 'text-slate-100' : 'text-slate-900';
	const helperClassName = isDarkMode ? 'text-slate-400' : 'text-slate-500';
	const cardClassName = isDarkMode
		? 'border-slate-800 bg-slate-950'
		: 'border-slate-200 bg-white';
	const selectedClassName = isDarkMode
		? 'border-amber-300/70 bg-amber-300/10'
		: 'border-amber-300 bg-amber-50';
	const iconColor = isDarkMode ? '#FCD34D' : '#D97706';

	return (
		<Actionsheet isOpen={isOpen} onClose={onClose} snapPoints={[78]}>
			<ActionsheetBackdrop />
			<ActionsheetContent className={isDarkMode ? 'bg-slate-950' : 'bg-white'}>
				<ActionsheetDragIndicatorWrapper>
					<ActionsheetDragIndicator />
				</ActionsheetDragIndicatorWrapper>

				<VStack className="w-full px-5 pb-3 pt-6 gap-1">
					<Heading size="lg" className={textClassName}>
						{title}
					</Heading>
					<Text className={`${helperClassName} text-sm`}>{description}</Text>
				</VStack>

				<ActionsheetScrollView
					className="w-full flex-1"
					contentContainerStyle={{ paddingBottom: 96 }}
					keyboardShouldPersistTaps="handled"
				>
					<VStack className="w-full px-4 pb-4 gap-3">
						{options.map(option => {
							const isSelected = option.id === selectedValue;
							const OptionIcon = getOptionIcon(option.id);

							return (
								<ActionsheetItem
									key={option.id}
									onPress={() => onSelect(option.id)}
									className={`rounded-2xl border ${cardClassName} ${
										isSelected ? selectedClassName : ''
									}`}
								>
									<HStack className="w-full items-center gap-3">
										<View
											className={`h-12 w-12 items-center justify-center rounded-2xl ${
												isDarkMode ? 'bg-slate-900' : 'bg-slate-100'
											}`}
										>
											<OptionIcon size={21} color={iconColor} />
										</View>
										<VStack className="min-w-0 flex-1 items-start gap-1">
											<ActionsheetItemText className={`${textClassName} mx-0 text-sm font-semibold`}>
												{option.label}
											</ActionsheetItemText>
											<Text className={`${helperClassName} text-xs leading-5`}>
												{option.description}
											</Text>
										</VStack>
										{isSelected ? <Check size={19} color={iconColor} /> : null}
									</HStack>
								</ActionsheetItem>
							);
						})}
					</VStack>
				</ActionsheetScrollView>
			</ActionsheetContent>
		</Actionsheet>
	);
}
