import React from 'react';
import { Image, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { HStack } from '@/components/ui/hstack';
import { Copy, UsersRound } from 'lucide-react';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import Navigator from '@/components/web/navigation/navigator.web';
import WebScreenHero from '@/components/web/navigation/web-screen-hero.web';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { WEB_EXPENSE_CLASS_NAMES as webExpenseClassNames } from '@/design-system/web-forms';
import { LUMUS_CLASS_NAMES as ui, LUMUS_FORM_CLASS_NAMES as form, LUMUS_LAYOUT_TOKENS } from '@/design-system/tokens';
import { WEB_DASHBOARD_CLASS_NAMES as layout } from '@/design-system/web-dashboard';
import { APP_ROUTE_PATHS, createAppHref } from '@/utils/navigation';
import { cn } from '@/lib/utils';
import Wallpaper from '@/assets/Background/wallpaper01.png';
import ProfileIllustration from '@/assets/UnDraw/perfilPersonScreen.svg';

const bodyText = ui.body;

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
	const nameRef = React.useRef<HTMLInputElement>(null);
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

	React.useEffect(() => {
		if (!state.dirty && !state.saving) return;
		const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [state.dirty, state.saving]);

	return (
		<div className={cn(ui.screen, layout.screen, 'relative flex h-full min-h-0 flex-col')}>
			<View className={cn(layout.hero, 'bg-white dark:bg-slate-950')} style={{ height: heroHeight }}>
				<Image source={Wallpaper} className={layout.heroImage} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', zIndex: 0 }} resizeMode="cover" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
				<WebScreenHero title="Meu perfil" Illustration={ProfileIllustration} isDarkMode={isDarkMode} topPadding={insets.top + 24} />
			</View>
			<main className={cn(layout.sheet, ui.screen, 'relative z-sheet min-h-0 overflow-y-auto')} style={{ marginTop: heroHeight - 64 }}>
				<div className={cn(layout.contentFrame, layout.contentPadding, 'mx-auto py-6 pb-12')}>
					<h1 className="sr-only">Meu perfil</h1>
					{state.loading ? <p role="status" className={ui.helper}>Carregando seu perfil…</p> : state.loadError ? (
						<div className="flex flex-col items-start gap-4">
							<p role="alert" className={ui.errorText}>{state.loadError}</p>
							<button type="button" className={cn(ui.secondaryButton, ui.focusRing, 'px-5')} onClick={state.reload}>Tentar novamente</button>
						</div>
					) : profile ? (
						<div className="flex min-w-0 flex-col gap-8">
							<section aria-label="Dados pessoais" className="min-w-0">
								<form noValidate onSubmit={async event => {
									event.preventDefault();
									if (!(await state.save())) nameRef.current?.focus();
								}}>
									<HStack className="w-full items-start gap-4">
										<div className="min-w-0 flex-1">
											<label htmlFor="profile-name" className={`${webExpenseClassNames.fieldLabel} ${bodyText} block`}>Nome</label>
										<div className={cn(
												form.input.replace(` ${ui.focusRing}`, ''),
												'w-full transition-colors',
												!state.nameError && 'web:focus-within:border-lumus-accent web:focus-within:ring-2 web:focus-within:ring-lumus-accent',
												state.nameError && 'border-error-600',
													state.saving && 'opacity-50',
												)}>
												<input ref={nameRef} id="profile-name" name="name" autoComplete="name" required maxLength={100}
													value={state.name} onChange={event => state.changeName(event.target.value)} disabled={state.saving}
													aria-invalid={Boolean(state.nameError)} aria-describedby={state.nameError ? 'profile-name-error' : undefined}
													className="h-full w-full border-0 bg-transparent p-0 outline-none focus:border-0 focus:outline-none focus:ring-0" />
											</div>
											{state.nameError && <p id="profile-name-error" role="alert" className={form.error}>{state.nameError}</p>}
										</div>
										<div className="min-w-0 flex-1">
											<label htmlFor="profile-created-at" className={cn(form.label, 'block')}>Membro desde</label>
											{profile.createdAt ? <input id="profile-created-at" name="createdAt" type="date" disabled
												value={profile.createdAt.toISOString().slice(0, 10)} aria-label="Membro desde, somente leitura"
												className={cn(form.input, 'w-full web:transition-colors web:hover:border-slate-400 dark:web:hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-40')} /> :
												<p className={ui.body}>Data não disponível</p>}
										</div>
									</HStack>
									<div className="mt-6 space-y-5">
						<div>
							<label htmlFor="profile-email" className={cn(form.label, 'block')}>E-mail de acesso</label>
							<input id="profile-email" name="email" type="email" autoComplete="email" readOnly tabIndex={-1} value={profile.email}
								aria-label="E-mail de acesso, somente leitura" className={cn(form.input.replace(` ${ui.focusRing}`, ''), 'pointer-events-none w-full select-text opacity-40')} />
						</div>
										</div>
									<HStack className="mt-6 w-full grow gap-3">
										<button type="submit" disabled={state.saving || !state.dirty} aria-busy={state.saving} className={cn(ui.primaryButton, 'min-h-12 flex-1 px-5 font-bold text-white')}>
											{state.saving ? 'Salvando…' : 'Salvar alterações'}
										</button>
										{state.dirty && <button type="button" disabled={state.saving} onClick={state.reset} className={cn(ui.secondaryButton, ui.focusRing, 'min-h-12 flex-1 px-5 disabled:opacity-50')}>Descartar alterações</button>}
									</HStack>
									<div role="status" aria-live="polite" aria-atomic="true" className="mt-4">
										{state.feedback && <p className={state.feedback.error ? ui.errorText : ui.successText}>{state.feedback.text}</p>}
									</div>
								</form>
							</section>
							<section aria-labelledby="profile-access-heading" className="min-w-0">
								<h2 id="profile-access-heading" className={cn(ui.heading, 'mb-3 text-lg font-bold')}>Informações da conta</h2>
								<div className="flex flex-row flex-wrap gap-3">
									<div className={cn(ui.card, 'min-w-0 flex-1 px-4 py-4')}>
										<p className={cn(ui.helper, 'text-xs uppercase tracking-wide')}>Tipo de acesso</p>
										<p aria-live="polite" className={cn(ui.heading, 'mt-2 text-lg font-semibold')}>
											{accessLevelValue}
										</p>
									</div>
									<div className={cn(ui.card, 'min-w-0 flex-1 px-4 py-4')}>
										<p className={cn(ui.helper, 'text-xs uppercase tracking-wide')}>Cadastros monitorados</p>
										<p aria-live="polite" className={cn(ui.heading, 'mt-2 text-lg font-semibold')}>
											{monitoredRecordsValue}
										</p>
									</div>
								</div>
								{state.accessSummaryError && <div className="mt-3 flex flex-col items-start gap-3">
									<p role="alert" className={ui.errorText}>Não foi possível carregar as informações da conta.</p>
									<button type="button" onClick={state.reload} className={cn(ui.secondaryButton, ui.focusRing, 'min-h-12 px-5')}>Tentar novamente</button>
								</div>}
							</section>
							<section aria-labelledby="profile-sharing-heading" className={cn(ui.card, 'w-full min-w-0 p-5')}>
								<h2 id="profile-sharing-heading" className={cn(ui.heading, 'text-lg font-bold')}>Contas vinculadas</h2>
								{state.relatedUsersLoading ? <p role="status" className={cn(ui.helper, 'mt-2 text-sm')}>Carregando contas vinculadas…</p> : state.relatedUsersError ? <div className="mt-2 flex flex-col items-start gap-2"><p role="alert" className={ui.errorText}>Não foi possível carregar as contas vinculadas.</p><button type="button" onClick={state.reload} className={cn(ui.secondaryButton, ui.focusRing, 'min-h-12 px-5')}>Tentar novamente</button></div> : state.relatedUsers.length ? <ul className="mt-2 space-y-2">{state.relatedUsers.map(user => <li key={user.id} className={ui.body}>{user.name}</li>)}</ul> : <p className={cn(ui.helper, 'mt-2 text-sm')}>Nenhuma pessoa vinculada.</p>}
								<label htmlFor="profile-id" className={cn(form.label, 'mt-6 block')}>Seu ID</label>
								<HStack className="w-full items-center gap-3">
									<input id="profile-id" name="id" readOnly tabIndex={-1} value={profile.uid} aria-label="Seu ID, somente leitura"
										className={cn(form.input.replace(` ${ui.focusRing}`, ''), 'pointer-events-none min-w-0 flex-1 select-text opacity-40')} />
									<button type="button" onClick={() => void handleCopyId()} aria-label="Copiar meu ID" className={cn(ui.iconButton, ui.surface, 'inline-flex shrink-0 items-center justify-center bg-transparent p-0 text-yellow-600 dark:text-yellow-300')}><Copy size={18} aria-hidden /></button>
								</HStack>
								{isRouteVisible('addUserRelation') && <Link href={createAppHref(APP_ROUTE_PATHS.addUserRelation, { fromProfile: '1' })} className={cn(ui.secondaryButton, ui.focusRing, 'mt-3 flex min-h-12 w-full items-center justify-center gap-2 px-4 text-base font-bold no-underline')}><UsersRound size={18} aria-hidden />Relacionar usuário</Link>}
							</section>
						</div>
					) : null}
				</div>
			</main>
			<Navigator defaultValue={2} profileDisplayName={profile?.name} />
		</div>
	);
}
