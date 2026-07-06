import React from 'react';
import { ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
	Accordion,
	AccordionContent,
	AccordionHeader,
	AccordionIcon,
	AccordionItem,
	AccordionTitleText,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { Box } from '@/components/ui/box';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icon';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import {
	Select,
	SelectBackdrop,
	SelectContent,
	SelectDragIndicator,
	SelectDragIndicatorWrapper,
	SelectIcon,
	SelectInput,
	SelectItem,
	SelectPortal,
	SelectTrigger,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import Navigator from '@/components/uiverse/navigator';
import {
	POST_SUBMIT_DESTINATION_OPTIONS,
	POST_SUBMIT_SCREEN_OPTIONS,
	type PostSubmitDestinationKey,
	type PostSubmitScreenKey,
	usePostSubmitBehaviorPreferences,
} from '@/contexts/PostSubmitBehaviorContext';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { navigateToHomeConfigurations } from '@/utils/navigation';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import ScreenSettingsIllustration from '../assets/UnDraw/screenConfigurationsSettings.svg';

const getDestinationLabel = (destinationKey: PostSubmitDestinationKey) =>
	POST_SUBMIT_DESTINATION_OPTIONS.find(option => option.key === destinationKey)?.label ?? 'Home';

export default function ScreenSettingsScreen() {
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		notTintedCardClassName,
		fieldContainerCardClassName,
		heroHeight,
		insets,
		switchTrackColor,
		switchThumbColor,
		switchIosBackgroundColor,
	} = useScreenStyles();
	const {
		getBehaviorForScreen,
		updateBehaviorForScreen,
		isLoadingPostSubmitBehavior,
	} = usePostSubmitBehaviorPreferences();

	const handleReturnToggle = React.useCallback(
		(screenKey: PostSubmitScreenKey, value: boolean) => {
			updateBehaviorForScreen(screenKey, current => ({
				...current,
				shouldReturnAfterSubmit: value,
				shouldClearFieldsAfterSubmit: value ? false : true,
			}));
		},
		[updateBehaviorForScreen],
	);

	const handleDestinationChange = React.useCallback(
		(screenKey: PostSubmitScreenKey, destination: string) => {
			updateBehaviorForScreen(screenKey, {
				returnDestination: destination as PostSubmitDestinationKey,
			});
		},
		[updateBehaviorForScreen],
	);

	const handleClearFieldsToggle = React.useCallback(
		(screenKey: PostSubmitScreenKey, value: boolean) => {
			updateBehaviorForScreen(screenKey, current => {
				if (current.shouldReturnAfterSubmit) {
					return current;
				}

				return {
					...current,
					shouldClearFieldsAfterSubmit: value,
				};
			});
		},
		[updateBehaviorForScreen],
	);

	const handleBackToConfigurations = React.useCallback(() => {
		navigateToHomeConfigurations();
		return true;
	}, []);

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<View className={`absolute top-0 left-0 right-0 ${cardBackground}`} style={{ height: heroHeight }}>
					<Image
						source={LoginWallpaper}
						alt="Background da tela de configurações das telas"
						className="absolute h-full w-full rounded-b-3xl"
						resizeMode="cover"
					/>

					<VStack
						className="h-full w-full items-center justify-start gap-4 px-6"
						style={{ paddingTop: insets.top + 24 }}
					>
						<Heading size="xl" className="text-center text-white">
							Configurações das telas
						</Heading>
						<ScreenSettingsIllustration width="40%" height="40%" className="opacity-90" />
					</VStack>
				</View>

				<ScrollView
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					nestedScrollEnabled
					showsVerticalScrollIndicator={false}
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
					style={{ marginTop: heroHeight - 64 }}
					contentContainerStyle={{ paddingBottom: 48 }}
				>
					<VStack className="mt-4 gap-4">
						<Accordion size="md" variant="unfilled" type="single" isCollapsible className="w-full">
							{POST_SUBMIT_SCREEN_OPTIONS.map(screenOption => {
								const behavior = getBehaviorForScreen(screenOption.key);
								const selectedDestinationLabel = getDestinationLabel(behavior.returnDestination);
								const isClearFieldsDisabled =
									behavior.shouldReturnAfterSubmit || isLoadingPostSubmitBehavior;

								return (
									<AccordionItem key={screenOption.key} value={screenOption.key}>
										<AccordionHeader>
											<AccordionTrigger className="px-0">
												{({ isExpanded }: { isExpanded: boolean }) => (
													<View className="w-full flex-row items-center justify-between">
														<VStack className="min-w-0 flex-1 pr-3">
															<AccordionTitleText className="font-semibold leading-5">
																{screenOption.label}
															</AccordionTitleText>
															<Text className={`${helperText} text-xs`} numberOfLines={1}>
																{behavior.shouldReturnAfterSubmit
																	? `Volta para ${selectedDestinationLabel}`
																	: behavior.shouldClearFieldsAfterSubmit
																		? 'Permanece na tela e limpa campos'
																		: 'Permanece na tela mantendo campos'}
															</Text>
														</VStack>
														<AccordionIcon
															as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
															className={helperText}
														/>
													</View>
												)}
											</AccordionTrigger>
										</AccordionHeader>

											<AccordionContent className="px-0">
												<VStack className="gap-3">
													<Text className={`${helperText} text-sm leading-5`}>
														{screenOption.description}
													</Text>

													<Box className={`${notTintedCardClassName} px-4 py-4`}>									
															<VStack className="gap-4">
																<View className={`${fieldContainerCardClassName} px-4 py-3 pb-4`}>
																	<HStack className="items-center justify-between gap-4">
																		<VStack className="min-w-0 flex-1">
																			<Text className={`${bodyText} text-sm font-semibold`}>
																				Voltar após salvar
																			</Text>
																			<Text className={`${helperText} text-xs`}>
																				{behavior.shouldReturnAfterSubmit ? 'Sim' : 'Não'}
																			</Text>
																		</VStack>
																		<Switch
																			value={behavior.shouldReturnAfterSubmit}
																			onValueChange={value => handleReturnToggle(screenOption.key, value)}
																			isDisabled={isLoadingPostSubmitBehavior}
																			trackColor={switchTrackColor}
																			thumbColor={switchThumbColor}
																			ios_backgroundColor={switchIosBackgroundColor}
																		/>
																	</HStack>

																	<VStack className="gap-2">
																		<Text className={`${bodyText} text-sm font-semibold`}>
																			Tela de retorno
																		</Text>
																		<Select
																			selectedValue={behavior.returnDestination}
																			onValueChange={value => handleDestinationChange(screenOption.key, value)}
																			isDisabled={!behavior.shouldReturnAfterSubmit || isLoadingPostSubmitBehavior}
																		>
																			<SelectTrigger
																				variant="outline"
																				size="md"
																				className={`${fieldContainerClassName} ${!behavior.shouldReturnAfterSubmit ? 'opacity-50' : ''}`}
																			>
																				<SelectInput
																					placeholder="Selecione a tela de retorno"
																					className={inputField}
																					value={selectedDestinationLabel}
																				/>
																				<SelectIcon />
																			</SelectTrigger>
																			<SelectPortal>
																				<SelectBackdrop />
																				<SelectContent>
																					<SelectDragIndicatorWrapper>
																						<SelectDragIndicator />
																					</SelectDragIndicatorWrapper>
																					{POST_SUBMIT_DESTINATION_OPTIONS.map(destinationOption => (
																						<SelectItem
																							key={destinationOption.key}
																							label={destinationOption.label}
																							value={destinationOption.key}
																						/>
																					))}
																				</SelectContent>
																			</SelectPortal>
																		</Select>
																		<Text className={`${helperText} text-xs`}>
																			{behavior.shouldReturnAfterSubmit
																				? 'Destino usado imediatamente após o feedback de sucesso.'
																				: 'Ative a volta após salvar para liberar a escolha do destino.'}
																		</Text>
																	</VStack>
																</View>

															<HStack className={`items-center justify-between gap-4 ${isClearFieldsDisabled ? 'opacity-50' : ''}`}>
																<VStack className="min-w-0 flex-1">
																	<Text className={`${bodyText} text-sm font-semibold`}>
																		Limpar campos
																	</Text>
																	<Text className={`${helperText} text-xs`}>
																		Disponível apenas quando a tela não volta automaticamente.
																	</Text>
																</VStack>
																<Switch
																	value={!behavior.shouldReturnAfterSubmit && behavior.shouldClearFieldsAfterSubmit}
																	onValueChange={value => handleClearFieldsToggle(screenOption.key, value)}
																	isDisabled={isClearFieldsDisabled}
																	trackColor={switchTrackColor}
																	thumbColor={switchThumbColor}
																	ios_backgroundColor={switchIosBackgroundColor}
																/>
															</HStack>
														</VStack>
													</Box>
												</VStack>
											</AccordionContent>
									</AccordionItem>
								);
							})}
						</Accordion>
					</VStack>
				</ScrollView>

				<View
					style={{
						marginHorizontal: -18,
						paddingBottom: 0,
						flexShrink: 0,
					}}
				>
					<Navigator defaultValue={2} onHardwareBack={handleBackToConfigurations} />
				</View>
			</View>
		</SafeAreaView>
	);
}
