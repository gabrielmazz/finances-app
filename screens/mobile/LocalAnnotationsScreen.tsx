import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
import React from 'react';
import { FlatList, StatusBar, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import AnnotationIllustration from '@/assets/UnDraw/annotationScreen.svg';
import { Box } from '@/components/ui/box';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { AddIcon, ArrowLeftIcon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import AnnotationMarkdownEditor from '@/components/uiverse/annotations/annotation-markdown-editor';
import Navigator from '@/components/uiverse/navigation/navigator';
import { LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useSession } from '@/hooks/useSession';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import type { LocalAnnotation } from '@/types/localAnnotations';
import { getLocalAnnotationPreview, getLocalAnnotationTitle } from '@/utils/localAnnotations';

const updatedDateFormatter = new Intl.DateTimeFormat('pt-BR', {
	day: '2-digit',
	month: 'short',
	year: 'numeric',
});

const formatUpdatedDate = (updatedAtISO: string) => updatedDateFormatter.format(new Date(updatedAtISO));

type AnnotationListItemProps = {
	annotation: LocalAnnotation;
	onOpen: (annotation: LocalAnnotation) => void;
};

const AnnotationListItem = React.memo(({ annotation, onOpen }: AnnotationListItemProps) => {
	const handleOpen = React.useCallback(() => onOpen(annotation), [annotation, onOpen]);

	return (
		<Button
			action="default"
			variant="outline"
			size="md"
			className="mb-3 h-auto min-h-[96px] w-full justify-start rounded-3xl border-outline-200 bg-background-0 px-4 py-4"
			onPress={handleOpen}
		>
			<VStack space="xs" className="w-full items-start">
				<HStack space="sm" className="w-full items-center justify-between">
					<ButtonText numberOfLines={1} className="flex-1 text-left text-typography-900">
						{getLocalAnnotationTitle(annotation)}
					</ButtonText>
					<Text size="xs" className="text-typography-500">
						{formatUpdatedDate(annotation.updatedAtISO)}
					</Text>
				</HStack>
				<Text numberOfLines={2} size="sm" className="w-full text-left text-typography-500">
					{getLocalAnnotationPreview(annotation)}
				</Text>
			</VStack>
		</Button>
	);
});

AnnotationListItem.displayName = 'AnnotationListItem';

export default function LocalAnnotationsScreen() {
	const { user } = useSession();
	const { height: windowHeight } = useWindowDimensions();
	const {
		addTagButtonClassName,
		bodyText,
		cardBackground,
		headingText,
		heroHeight,
		insets,
		inputField,
		isDarkMode,
		surfaceBackground,
		submitButtonClassName,
		submitButtonTextClassName,
	} = useScreenStyles();
	const annotations: LocalAnnotation[] = [];
	const isLoading = false;
	const isSaving = false;
	const loadError = FEATURE_UNAVAILABLE_MESSAGE;
	const hasStorageConflict = false;
	const [isDraftOpen, setDraftOpen] = React.useState(false);
	const [draftTitle, setDraftTitle] = React.useState('');
	const [draftMarkdown, setDraftMarkdown] = React.useState('');
	const [saveError, setSaveError] = React.useState('Rascunho não salvo. O salvamento está indisponível.');
	const annotationEditorHeight = Math.max(340, windowHeight - insets.top - insets.bottom - 148);
	const loadAnnotations = async () => showFeatureUnavailable();
	const handleOpenAnnotation = (annotation: LocalAnnotation) => {
		setDraftTitle(annotation.title);
		setDraftMarkdown(annotation.markdown);
		setDraftOpen(true);
	};
	const handleReloadAnnotation = async () => showFeatureUnavailable();
	const handleMarkdownChange = async (markdown: string) => setDraftMarkdown(markdown);
	const handleCreateAnnotation = () => setDraftOpen(true);
	const handleSaveAnnotation = async () => {
		setSaveError(FEATURE_UNAVAILABLE_MESSAGE);
	};

	const renderAnnotationItem = React.useCallback(
		({ item }: { item: LocalAnnotation }) => (
			<AnnotationListItem annotation={item} onOpen={handleOpenAnnotation} />
		),
		[handleOpenAnnotation],
	);

	const keyExtractor = React.useCallback((annotation: LocalAnnotation) => annotation.id, []);

	if (isDraftOpen) {
		return (
			<SafeAreaView className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<StatusBar
					barStyle={isDarkMode ? 'light-content' : 'dark-content'}
				/>
				<Box className={`flex-1 px-5 pb-5 pt-3 ${cardBackground}`}>
					<HStack space="sm" className="items-center">
						<Button
							action="default"
							variant="outline"
							size="sm"
							className={`${addTagButtonClassName} px-0`}
							onPress={() => setDraftOpen(false)}
							isDisabled={isSaving}
							accessibilityLabel="Voltar para anotações"
						>
							<ButtonIcon as={ArrowLeftIcon} />
						</Button>
						<Heading size="md" className={`flex-1 ${headingText}`} isTruncated>
							Editar anotação
						</Heading>
						<Button
							action="primary"
							variant="solid"
							size="sm"
							className={submitButtonClassName}
							onPress={() => void handleSaveAnnotation()}
							isDisabled={isSaving}
						>
							{isSaving ? <ButtonSpinner /> : null}
							<ButtonText className={submitButtonTextClassName}>
								{isSaving ? 'Salvando' : 'Salvar'}
							</ButtonText>
						</Button>
					</HStack>

					<VStack space="sm" className="flex-1 pt-4">
						{saveError ? (
							<Text accessibilityRole="alert" className="text-lumus-error">
								{saveError}
							</Text>
						) : null}
						{hasStorageConflict ? (
							<VStack space="sm">
								<Text className={bodyText}>A anotação mudou. Seu rascunho continua aberto.</Text>
								<Button
									action="default"
									variant="outline"
									size="md"
									onPress={() => void handleReloadAnnotation()}
									isDisabled={isSaving}
								>
									<ButtonText>Descartar rascunho e recarregar</ButtonText>
								</Button>
							</VStack>
						) : null}
						<Input size="lg" className={LUMUS_FORM_CLASS_NAMES.input}>
							<InputField
								value={draftTitle}
								onChangeText={setDraftTitle}
								editable={!isSaving}
								placeholder="Título da anotação"
								accessibilityLabel="Título da anotação"
								className={inputField}
							/>
						</Input>

						<Box className="flex-1" style={{ height: annotationEditorHeight }}>
							<AnnotationMarkdownEditor
								key="local-draft"
								markdown={draftMarkdown}
								readOnly={isSaving}
								isDarkMode={isDarkMode}
								onChangeMarkdown={handleMarkdownChange}
								dom={{
									focusable: true,
									scrollEnabled: false,
									style: { height: annotationEditorHeight, backgroundColor: 'transparent' },
								}}
							/>
						</Box>
					</VStack>
				</Box>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			className="flex-1"
			edges={['left', 'right', 'bottom']}
			style={{ backgroundColor: surfaceBackground }}
		>
			<StatusBar
				barStyle={isDarkMode ? 'light-content' : 'dark-content'}
			/>
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<View className={`absolute left-0 right-0 top-0 ${cardBackground}`} style={{ height: heroHeight }}>
					<Image
						source={LoginWallpaper}
						alt="Cabeçalho das anotações"
						className="absolute h-full w-full rounded-b-3xl"
						resizeMode="cover"
					/>
					<VStack
						space="lg"
						className="h-full w-full items-center justify-start px-6"
						style={{ paddingTop: insets.top + 24 }}
					>
						<Heading size="xl" className="text-center text-white">
							Anotações
						</Heading>
						<AnnotationIllustration width="40%" height="40%" className="opacity-90" />
					</VStack>
				</View>

				<View className={`flex-1 rounded-t-3xl ${cardBackground}`} style={{ marginTop: heroHeight - 64 }}>
					<Box className="px-6 pb-4 pt-5">
						<Text size="sm" className={bodyText}>
							Ideias, listas e lembretes. Explore o editor com um rascunho não salvo.
						</Text>
						{loadError ? (
							<Text accessibilityRole="alert" className="text-lumus-error">
								{loadError}
							</Text>
						) : null}
						<Button
							action="default"
							variant="outline"
							onPress={() => void loadAnnotations()}
							isDisabled={isLoading}
						>
							<ButtonText>{loadError ? 'Tentar novamente' : 'Atualizar anotações'}</ButtonText>
						</Button>
						<Button
							action="primary"
							variant="solid"
							size="md"
							className={`mt-4 w-full ${submitButtonClassName}`}
							onPress={() => void handleCreateAnnotation()}
							isDisabled={isLoading}
						>
							<ButtonIcon as={AddIcon} />
							<ButtonText className={submitButtonTextClassName}>
								{isLoading ? 'Carregando' : 'Nova anotação'}
							</ButtonText>
						</Button>
					</Box>

					<FlatList
						data={annotations}
						renderItem={renderAnnotationItem}
						keyExtractor={keyExtractor}
						className="flex-1"
						contentInsetAdjustmentBehavior="automatic"
						contentContainerClassName="px-6 pb-6"
						ListEmptyComponent={
							// FlatList injeta arrays de style: View normaliza esses props antes do Box DOM Web.
							<View>
								{isLoading ? (
									<Box className="items-center px-6 py-14">
										<Text size="sm" className="text-typography-500">
											Carregando suas anotações...
										</Text>
									</Box>
								) : loadError ? null : (
									<Box className="items-center rounded-3xl border border-outline-200 bg-background-0 px-6 py-8">
										<Heading size="lg" className={`text-center ${headingText}`}>
											Sua primeira página começa aqui
										</Heading>
										<Text size="sm" className={`mt-2 text-center ${bodyText}`}>
											Crie uma anotação para registrar uma ideia, uma lista ou algo para lembrar depois.
										</Text>
									</Box>
								)}
							</View>
						}
					/>
				</View>

				<Navigator defaultValue={0} />
			</View>
		</SafeAreaView>
	);
}
