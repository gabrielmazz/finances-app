import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown } from 'lucide-react-native';

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
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { BankIcon } from '@/hooks/useBankIcons';

export type BankActionsheetOption = {
	id: string;
	name: string;
	description?: string | null;
	iconKey?: string | null;
	colorHex?: string | null;
};

type BankActionsheetSelectorProps = {
	options: BankActionsheetOption[];
	selectedId: string | null;
	selectedLabel?: string | null;
	selectedOption?: BankActionsheetOption | null;
	onSelect: (bank: BankActionsheetOption) => void;
	isDisabled?: boolean;
	isDarkMode: boolean;
	bodyTextClassName: string;
	helperTextClassName: string;
	triggerClassName: string;
	placeholder: string;
	sheetTitle: string;
	emptyMessage?: string;
	triggerHint?: string;
	disabledHint?: string;
	accessibilityLabel: string;
};

const sheetSnapPoints = [72];

export default function BankActionsheetSelector({
	options,
	selectedId,
	selectedLabel,
	selectedOption,
	onSelect,
	isDisabled = false,
	isDarkMode,
	bodyTextClassName,
	helperTextClassName,
	triggerClassName,
	placeholder,
	sheetTitle,
	emptyMessage = 'Nenhum banco disponível.',
	triggerHint = 'Toque para escolher um banco.',
	disabledHint = 'Banco indisponível no momento.',
	accessibilityLabel,
}: BankActionsheetSelectorProps) {
	const [isOpen, setIsOpen] = React.useState(false);
	const insets = useSafeAreaInsets();

	const sortedOptions = React.useMemo(
		() =>
			[...options].sort((a, b) =>
				a.name.localeCompare(b.name, 'pt-BR', {
					sensitivity: 'base',
				}),
			),
		[options],
	);

	const resolvedSelectedOption = React.useMemo(() => {
		if (selectedOption) {
			return selectedOption;
		}

		const matchedOption = selectedId ? options.find(option => option.id === selectedId) : null;
		if (matchedOption) {
			return matchedOption;
		}

		if (selectedId && selectedLabel) {
			return {
				id: selectedId,
				name: selectedLabel,
			};
		}

		return null;
	}, [options, selectedId, selectedLabel, selectedOption]);

	const iconSurfaceClassName = isDarkMode
		? 'border border-slate-800 bg-slate-900'
		: 'border border-slate-200 bg-white';
	const selectedItemClassName = isDarkMode ? 'bg-slate-900 rounded-2xl' : 'bg-amber-50 rounded-2xl';
	const headingClassName = isDarkMode ? 'text-slate-100' : 'text-slate-900';
	const itemTextClassName = isDarkMode ? 'mx-0 text-slate-100' : 'mx-0 text-slate-900';
	const chevronColor = isDisabled ? '#94A3B8' : isDarkMode ? '#FCD34D' : '#D97706';
	const selectedName = resolvedSelectedOption?.name ?? selectedLabel ?? null;
	const selectedDescription = resolvedSelectedOption?.description ?? null;

	const handleOpen = React.useCallback(() => {
		if (isDisabled) {
			return;
		}

		setIsOpen(true);
	}, [isDisabled]);

	const handleSelect = React.useCallback(
		(bank: BankActionsheetOption) => {
			if (isDisabled) {
				return;
			}

			onSelect(bank);
			setIsOpen(false);
		},
		[isDisabled, onSelect],
	);

	React.useEffect(() => {
		if (isDisabled && isOpen) {
			setIsOpen(false);
		}
	}, [isDisabled, isOpen]);

	return (
		<>
			<Pressable
				onPress={handleOpen}
				disabled={isDisabled}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				accessibilityState={{ disabled: isDisabled, expanded: isOpen }}
				className={`${triggerClassName} px-4 py-3 ${isDisabled ? 'opacity-60' : ''}`}
			>
				<HStack className="items-center justify-between gap-3">
					<HStack className="min-w-0 flex-1 items-center gap-3">
						<View className={`h-11 w-11 items-center justify-center rounded-2xl ${iconSurfaceClassName}`}>
							<BankIcon
								iconKey={resolvedSelectedOption?.iconKey}
								name={resolvedSelectedOption?.name ?? selectedLabel}
								colorHex={resolvedSelectedOption?.colorHex}
								size={32}
							/>
						</View>
						<VStack className="min-w-0 flex-1 justify-center gap-0.5">
							<Text
								className={`${selectedName ? bodyTextClassName : helperTextClassName} text-sm font-medium leading-5`}
								numberOfLines={1}
							>
								{selectedName ?? placeholder}
							</Text>
							<Text className={`${helperTextClassName} text-xs leading-4`} numberOfLines={1}>
								{isDisabled
									? disabledHint
									: selectedDescription ?? (selectedName ? 'Toque para alterar o banco.' : triggerHint)}
							</Text>
						</VStack>
					</HStack>
					<ChevronDown size={18} color={chevronColor} />
				</HStack>
			</Pressable>

			<Actionsheet
				isOpen={isOpen && !isDisabled}
				onClose={() => setIsOpen(false)}
				snapPoints={sheetSnapPoints}
			>
				<ActionsheetBackdrop />
				<ActionsheetContent className={isDarkMode ? 'bg-slate-950' : 'bg-white'}>
					<ActionsheetDragIndicatorWrapper>
						<ActionsheetDragIndicator />
					</ActionsheetDragIndicatorWrapper>

					<VStack className="w-full px-4 pb-3 pt-6 gap-1">
						<Heading size="lg" className={headingClassName}>
							{sheetTitle}
						</Heading>
						<Text className={`${helperTextClassName} text-sm`}>
							{selectedName ? `Selecionado: ${selectedName}` : placeholder}
						</Text>
					</VStack>

					<ActionsheetScrollView
						className="w-full flex-1"
						keyboardShouldPersistTaps="handled"
						contentContainerStyle={{ paddingBottom: Math.max(96, insets.bottom + 72) }}
					>
						<VStack className="px-2 pb-2">
							{sortedOptions.length === 0 ? (
								<VStack className="items-center px-4 py-8">
									<Text className={`${bodyTextClassName} text-center text-sm`}>
										{emptyMessage}
									</Text>
								</VStack>
							) : null}

							{sortedOptions.map(bank => {
								const isSelected = bank.id === selectedId;

								return (
									<ActionsheetItem
										key={bank.id}
										onPress={() => handleSelect(bank)}
										className={isSelected ? selectedItemClassName : ''}
									>
										<HStack className="items-center gap-3 w-full">
											<View className={`h-11 w-11 items-center justify-center rounded-2xl ${iconSurfaceClassName}`}>
												<BankIcon
													iconKey={bank.iconKey}
													name={bank.name}
													colorHex={bank.colorHex}
													size={32}
												/>
											</View>
											<VStack className="min-w-0 flex-1 items-start justify-center">
												<ActionsheetItemText className={itemTextClassName}>
													{bank.name}
												</ActionsheetItemText>
												{bank.description || isSelected ? (
													<Text
														className={
															isSelected
																? 'text-xs text-amber-500 dark:text-amber-300'
																: `${helperTextClassName} text-xs`
														}
													>
														{bank.description ?? 'Selecionado atualmente'}
													</Text>
												) : null}
											</VStack>
											{isSelected ? <Check size={18} color={isDarkMode ? '#FCD34D' : '#D97706'} /> : null}
										</HStack>
									</ActionsheetItem>
								);
							})}
						</VStack>
					</ActionsheetScrollView>
				</ActionsheetContent>
			</Actionsheet>
		</>
	);
}
