import React from 'react';
import { FlatList, StatusBar, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import AnnotationIllustration from '@/assets/UnDraw/annotationScreen.svg';
import { Box } from '@/components/ui/box';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { ArrowLeftIcon, AddIcon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import AnnotationMarkdownEditor from '@/components/uiverse/annotation-markdown-editor';
import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { useAuth } from '@/contexts/AuthContext';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import type { LocalAnnotation } from '@/types/localAnnotations';
import {
	createLocalAnnotation,
	getLocalAnnotationPreview,
	getLocalAnnotationTitle,
	loadLocalAnnotations,
	saveLocalAnnotations,
} from '@/utils/localAnnotations';

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
	const { user } = useAuth();
	const { height: windowHeight } = useWindowDimensions();
	const {
		addTagButtonClassName,
		bodyText,
		cardBackground,
		fieldContainerClassNameNotSpace,
		headingText,
		heroHeight,
		insets,
		inputField,
		isDarkMode,
		surfaceBackground,
		submitButtonClassName,
		submitButtonTextClassName,
	} = useScreenStyles();
	const [annotations, setAnnotations] = React.useState<LocalAnnotation[]>([]);
	const [isLoading, setIsLoading] = React.useState(true);
	const [isSaving, setIsSaving] = React.useState(false);
	const [selectedAnnotationId, setSelectedAnnotationId] = React.useState<string | null>(null);
	const [draftTitle, setDraftTitle] = React.useState('');
	const [draftMarkdown, setDraftMarkdown] = React.useState('');
	const loadRequestIdRef = React.useRef(0);
	const draftMarkdownRef = React.useRef('');
	const annotationEditorHeight = Math.max(340, windowHeight - insets.top - insets.bottom - 148);

	const selectedAnnotation = React.useMemo(
		() => annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null,
		[annotations, selectedAnnotationId],
	);

	const loadAnnotations = React.useCallback(async () => {
		const requestId = loadRequestIdRef.current + 1;
		loadRequestIdRef.current = requestId;

		if (!user?.uid) {
			if (requestId === loadRequestIdRef.current) {
				setAnnotations([]);
				setIsLoading(false);
			}
			return;
		}

		setIsLoading(true);
		try {
			const storedAnnotations = await loadLocalAnnotations(user.uid);
			if (requestId === loadRequestIdRef.current) {
				setAnnotations(storedAnnotations);
			}
		} catch (error) {
			if (requestId !== loadRequestIdRef.current) {
				return;
			}
			console.error('Não foi possível abrir as anotações locais:', error);
			showNotifierAlert({
				title: 'Não foi possível abrir as anotações',
				description: 'Tente abrir esta tela novamente.',
				type: 'error',
				isDarkMode,
			});
		} finally {
			if (requestId === loadRequestIdRef.current) {
				setIsLoading(false);
			}
		}
	}, [isDarkMode, user?.uid]);

	useFocusEffect(
		React.useCallback(() => {
			void loadAnnotations();
		}, [loadAnnotations]),
	);

	const persistAnnotations = React.useCallback(
		async (nextAnnotations: LocalAnnotation[]) => {
			if (!user?.uid) {
				return false;
			}

			try {
				await saveLocalAnnotations(user.uid, nextAnnotations);
				return true;
			} catch (error) {
				console.error('Não foi possível salvar as anotações locais:', error);
				showNotifierAlert({
					title: 'Não foi possível salvar a anotação',
					description: 'Seu texto continua aberto. Tente salvar novamente.',
					type: 'error',
					isDarkMode,
				});
				return false;
			}
		},
		[isDarkMode, user?.uid],
	);

	const handleOpenAnnotation = React.useCallback((annotation: LocalAnnotation) => {
		setSelectedAnnotationId(annotation.id);
		setDraftTitle(annotation.title);
		setDraftMarkdown(annotation.markdown);
		draftMarkdownRef.current = annotation.markdown;
	}, []);

	const handleMarkdownChange = React.useCallback(async (markdown: string) => {
		draftMarkdownRef.current = markdown;
		setDraftMarkdown(markdown);
	}, []);

	const handleCreateAnnotation = React.useCallback(() => {
		if (!user?.uid || isLoading) {
			return;
		}

		loadRequestIdRef.current += 1;
		const annotation = createLocalAnnotation();
		const nextAnnotations = [annotation, ...annotations];
		setAnnotations(nextAnnotations);
		setSelectedAnnotationId(annotation.id);
		setDraftTitle('');
		setDraftMarkdown('');
		draftMarkdownRef.current = '';
	}, [annotations, isLoading, user?.uid]);

	const handleSaveAnnotation = React.useCallback(
		async (returnToList = false) => {
			if (!selectedAnnotation) {
				return;
			}

			setIsSaving(true);
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			const markdownToSave = draftMarkdownRef.current;
			const updatedAnnotation: LocalAnnotation = {
				...selectedAnnotation,
				title: draftTitle,
				markdown: markdownToSave,
				updatedAtISO: new Date().toISOString(),
			};
			const nextAnnotations = [
				updatedAnnotation,
				...annotations.filter((annotation) => annotation.id !== selectedAnnotation.id),
			];

			setAnnotations(nextAnnotations);
			const wasSaved = await persistAnnotations(nextAnnotations);
			setIsSaving(false);

			if (!wasSaved) {
				return;
			}

			if (returnToList) {
				setSelectedAnnotationId(null);
				return;
			}

			showNotifierAlert({
				title: 'Anotação salva',
				description: 'Ela está guardada apenas neste dispositivo.',
				type: 'success',
				isDarkMode,
			});
		},
		[annotations, draftTitle, isDarkMode, persistAnnotations, selectedAnnotation],
	);

	const renderAnnotationItem = React.useCallback(
		({ item }: { item: LocalAnnotation }) => <AnnotationListItem annotation={item} onOpen={handleOpenAnnotation} />,
		[handleOpenAnnotation],
	);

	const keyExtractor = React.useCallback((annotation: LocalAnnotation) => annotation.id, []);

	if (selectedAnnotation) {
		return (
			<SafeAreaView className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<StatusBar backgroundColor={surfaceBackground} barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
				<Box className={`flex-1 px-5 pb-5 pt-3 ${cardBackground}`}>
					<HStack space="sm" className="items-center">
						<Button
							action="default"
							variant="outline"
							size="sm"
							className={`${addTagButtonClassName} px-0`}
							onPress={() => void handleSaveAnnotation(true)}
							isDisabled={isSaving}
							accessibilityLabel="Salvar e voltar para anotações"
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
							<ButtonText className={submitButtonTextClassName}>{isSaving ? 'Salvando' : 'Salvar'}</ButtonText>
						</Button>
					</HStack>

					<VStack space="sm" className="flex-1 pt-4">
						<Input size="lg" className={fieldContainerClassNameNotSpace}>
							<InputField
								value={draftTitle}
								onChangeText={setDraftTitle}
								placeholder="Título da anotação"
								accessibilityLabel="Título da anotação"
								className={inputField}
							/>
						</Input>

						<Box className="flex-1" style={{ height: annotationEditorHeight }}>
							<AnnotationMarkdownEditor
								markdown={draftMarkdown}
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
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
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
							Ideias, listas e lembretes — só neste dispositivo.
						</Text>
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
							isLoading ? (
								<Box className="items-center px-6 py-14">
									<Text size="sm" className="text-typography-500">
										Carregando suas anotações...
									</Text>
								</Box>
							) : (
								<Box className="items-center rounded-3xl border border-outline-200 bg-background-0 px-6 py-8">
									<Heading size="lg" className={`text-center ${headingText}`}>
										Sua primeira página começa aqui
									</Heading>
									<Text size="sm" className={`mt-2 text-center ${bodyText}`}>
										Crie uma anotação para registrar uma ideia, uma lista ou algo para lembrar depois.
									</Text>
								</Box>
							)
						}
					/>
				</View>

				<Navigator defaultValue={0} />
			</View>
		</SafeAreaView>
	);
}
