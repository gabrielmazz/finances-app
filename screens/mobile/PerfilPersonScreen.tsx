import React from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { CopyIcon } from '@/components/ui/icon';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import Navigator from '@/components/mobile/navigation/navigator.native';
import WebScreenHero from '@/components/mobile/navigation/web-screen-hero.native';
import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { LUMUS_CLASS_NAMES as ui, LUMUS_FORM_CLASS_NAMES as form, LUMUS_LAYOUT_TOKENS } from '@/design-system/tokens';
import { APP_ROUTE_PATHS, navigateToHomeDashboard, navigateToRoute } from '@/utils/navigation';
import { cn } from '@/lib/utils';
import Wallpaper from '@/assets/Background/wallpaper01.png';
import ProfileIllustration from '@/assets/UnDraw/perfilPersonScreen.svg';

export default function PerfilPersonScreen() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();
	const heroHeight =
		Math.max(
			windowHeight * LUMUS_LAYOUT_TOKENS.heroViewportRatio,
			LUMUS_LAYOUT_TOKENS.heroMinimumHeight,
		) + insets.top;
	const { isRouteVisible } = useRouteVisibility();
	const state = useUserProfile();
	const nameRef = React.useRef<TextInput>(null);
	const getInputRef = React.useCallback(() => nameRef, []);
	const keyboard = useKeyboardAwareScroll<'name'>({ getInputRef });
	const profile = state.profile;
	const accessLevelValue = state.accessSummaryLoading
		? 'Carregando…'
		: state.accessSummaryError || !state.accessSummary
			? 'Indisponível'
			: state.accessSummary.isAdmin ? 'Administrador' : 'Padrão';
	const monitoredRecordsValue = state.accessSummaryLoading
		? 'Carregando…'
		: state.accessSummaryError || !state.accessSummary
			? 'Indisponível'
			: state.accessSummary.monitoredRecordsCount;
	const handleCopyId = async () => {
		if (await state.copyId()) {
			showNotifierAlert({ description: 'ID copiado para a área de transferência.', type: 'success', isDarkMode });
		}
	};
	const save = async () => {
		Keyboard.dismiss();
		if (!(await state.save())) nameRef.current?.focus();
	};

	return (
		<ScreenDismissKeyboard>
			<SafeAreaView className={cn(ui.screen, 'web:w-screen')} edges={['left', 'right', 'bottom']}>
				<KeyboardAvoidingView className="relative flex-1 web:w-screen" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
					<View className="absolute left-0 right-0 top-0 overflow-hidden rounded-b-3xl bg-white dark:bg-slate-950 web:w-screen" style={{ height: heroHeight }}>
						<Image source={Wallpaper} className="absolute inset-0 h-full w-full rounded-b-3xl" resizeMode="cover" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
						<SafeAreaView edges={['top']} className="flex-1">
							<WebScreenHero title="Meu perfil" Illustration={ProfileIllustration} isDarkMode={isDarkMode} topPadding={24} />
						</SafeAreaView>
					</View>
					<View className={cn(ui.screen, 'rounded-t-sheet px-6 web:relative web:z-sheet')} style={{ marginTop: heroHeight - 64 }}>
						<ScrollView ref={keyboard.scrollViewRef} className="flex-1"
							keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onScroll={keyboard.handleScroll} scrollEventThrottle={keyboard.scrollEventThrottle}
							contentContainerStyle={{ paddingBottom: keyboard.contentBottomPadding }}>
							<View className="gap-6 pt-6">
								{state.loading ? <Text accessibilityRole="progressbar" accessibilityLabel="Carregando seu perfil" className={ui.helper}>Carregando seu perfil…</Text> : state.loadError ? (
									<View className="gap-4">
										<Text accessibilityRole="alert" className={ui.errorText}>{state.loadError}</Text>
										<Button onPress={state.reload} className={cn(ui.secondaryButton, 'min-h-12')}><ButtonText className={ui.body}>Tentar novamente</ButtonText></Button>
									</View>
								) : profile ? <>
									<HStack className="w-full items-start gap-4">
										<View className="min-w-0 flex-1">
											<Text nativeID="profile-name-label" className={form.label}>Nome</Text>
											<Input isInvalid={Boolean(state.nameError)} isDisabled={state.saving} className={cn(form.input, 'min-h-12')}>
												<InputField ref={nameRef} value={state.name} onChangeText={state.changeName} editable={!state.saving} maxLength={100}
													autoComplete="name" autoCapitalize="words" returnKeyType="done" accessibilityLabel="Nome" accessibilityLabelledBy="profile-name-label"
													aria-invalid={Boolean(state.nameError)} aria-describedby={state.nameError ? 'profile-name-error' : undefined}
													onFocus={() => keyboard.handleInputFocus('name')} onSubmitEditing={() => void save()} className={ui.inputText} />
											</Input>
											{state.nameError && <Text nativeID="profile-name-error" accessibilityRole="alert" className={form.error}>{state.nameError}</Text>}
										</View>
										<View className="min-w-0 flex-1">
											<Text nativeID="profile-created-at-label" className={form.label}>Membro desde</Text>
											{profile.createdAt ? <Input isReadOnly className={cn(form.input, 'min-h-12 opacity-40')}>
												<InputField value={profile.createdAt.toLocaleDateString('pt-BR')} editable={false} selectTextOnFocus
													accessibilityLabel="Membro desde, somente leitura" accessibilityLabelledBy="profile-created-at-label" className={ui.inputText} />
											</Input> : <Text className={ui.body}>Data não disponível</Text>}
										</View>
									</HStack>
									<View>
										<Text nativeID="profile-email-label" className={form.label}>E-mail de acesso</Text>
											<Input isReadOnly className={cn(form.input, 'min-h-12 opacity-40')}>
											<InputField value={profile.email} editable={false} selectTextOnFocus accessibilityLabel="E-mail de acesso, somente leitura"
												accessibilityLabelledBy="profile-email-label" className={ui.inputText} />
										</Input>
									</View>
									<View className="gap-3">
										<Button onPress={() => void save()} isDisabled={state.saving || !state.dirty} accessibilityState={{ busy: state.saving }} className={cn(ui.primaryButton, 'min-h-12')}>
											<ButtonText className="font-bold text-white">{state.saving ? 'Salvando…' : 'Salvar alterações'}</ButtonText>
										</Button>
										{state.dirty && <Button onPress={state.reset} isDisabled={state.saving} className={cn(ui.secondaryButton, 'min-h-12')}><ButtonText className={ui.body}>Descartar alterações</ButtonText></Button>}
									</View>
									<View accessibilityLiveRegion="polite">
										{state.feedback && <Text className={state.feedback.error ? ui.errorText : ui.successText}>{state.feedback.text}</Text>}
									</View>
									<View className="gap-3">
										<Heading size="lg" className={ui.heading}>Informações da conta</Heading>
										<View className="flex-row flex-wrap gap-3">
											<View className={cn(ui.card, 'min-w-0 flex-1 px-4 py-4')}>
												<Text className={cn(ui.helper, 'text-xs uppercase tracking-wide')}>Tipo de acesso</Text>
												<Text accessibilityLiveRegion="polite" className={cn(ui.heading, 'mt-2 text-lg font-semibold')}>
													{accessLevelValue}
												</Text>
											</View>
											<View className={cn(ui.card, 'min-w-0 flex-1 px-4 py-4')}>
												<Text className={cn(ui.helper, 'text-xs uppercase tracking-wide')}>Cadastros monitorados</Text>
												<Text accessibilityLiveRegion="polite" className={cn(ui.heading, 'mt-2 text-lg font-semibold')}>
													{monitoredRecordsValue}
												</Text>
											</View>
										</View>
										{state.accessSummaryError && <View className="gap-3">
											<Text accessibilityRole="alert" className={ui.errorText}>Não foi possível carregar as informações da conta.</Text>
											<Button onPress={state.reload} className={cn(ui.secondaryButton, ui.focusRing, 'min-h-12')}><ButtonText className={ui.body}>Tentar novamente</ButtonText></Button>
										</View>}
									</View>
									<View className={cn(ui.card, 'gap-3 p-4')}>
										<Heading size="lg" className={ui.heading}>Contas vinculadas</Heading>
										{state.relatedUsersLoading ? <Text className={ui.helper}>Carregando contas vinculadas…</Text> : state.relatedUsersError ? <View className="gap-2"><Text accessibilityRole="alert" className={ui.errorText}>Não foi possível carregar as contas vinculadas.</Text><Button onPress={state.reload} className={cn(ui.secondaryButton, 'min-h-12')}><ButtonText className={ui.body}>Tentar novamente</ButtonText></Button></View> : state.relatedUsers.length ? <View className="gap-2">{state.relatedUsers.map(user => <Text key={user.id} className={ui.body}>{user.name}</Text>)}</View> : <Text className={ui.helper}>Nenhuma pessoa vinculada.</Text>}
										<Text nativeID="profile-id-label" className={form.inlineLabel}>Seu ID</Text>
										<HStack className="w-full items-center gap-3">
											<Input isReadOnly className={cn(form.input, 'min-h-12 min-w-0 flex-1 opacity-40')}>
												<InputField value={profile.uid} editable={false} selectTextOnFocus accessibilityLabel="Seu ID, somente leitura"
													accessibilityLabelledBy="profile-id-label" className={ui.inputText} />
											</Input>
											<Button onPress={() => void handleCopyId()} accessibilityLabel="Copiar meu ID" className={cn(ui.iconButton, ui.surface, 'shrink-0 bg-transparent')}><ButtonIcon as={CopyIcon} className="text-yellow-600 dark:text-yellow-300" /></Button>
										</HStack>
										{isRouteVisible('addUserRelation') && <Button onPress={() => navigateToRoute(APP_ROUTE_PATHS.addUserRelation, { fromProfile: '1' })} className={cn(ui.secondaryButton, 'mt-3 min-h-12 w-full')}><ButtonText className={cn(ui.body, 'text-base font-bold')}>Relacionar usuário</ButtonText></Button>}
									</View>
								</> : null}
							</View>
						</ScrollView>
					</View>
				</KeyboardAvoidingView>
				<Navigator defaultValue={2} onHardwareBack={() => { navigateToHomeDashboard(); return true; }} />
			</SafeAreaView>
		</ScreenDismissKeyboard>
	);
}
