import React from 'react';
import { Image, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Copy, UsersRound } from 'lucide-react';
import Navigator from '@/components/web/navigation/navigator.web';
import WebScreenHero from '@/components/web/navigation/web-screen-hero.web';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { LUMUS_CLASS_NAMES as ui, LUMUS_FORM_CLASS_NAMES as form, LUMUS_LAYOUT_TOKENS } from '@/design-system/tokens';
import { WEB_DASHBOARD_CLASS_NAMES as layout } from '@/design-system/web-dashboard';
import { APP_ROUTE_PATHS, createAppHref } from '@/utils/navigation';
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
	const nameRef = React.useRef<HTMLInputElement>(null);
	const profile = state.profile;

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
							<section aria-labelledby="profile-data-heading" className="min-w-0">
								<h2 id="profile-data-heading" className={cn(ui.heading, 'mb-5 text-lg font-bold')}>Dados pessoais</h2>
								<form noValidate onSubmit={async event => {
									event.preventDefault();
									if (!(await state.save())) nameRef.current?.focus();
								}}>
									<label htmlFor="profile-name" className={cn(form.label, 'block')}>Nome</label>
									<input ref={nameRef} id="profile-name" name="name" autoComplete="name" required maxLength={100}
										value={state.name} onChange={event => state.changeName(event.target.value)} disabled={state.saving}
										aria-invalid={Boolean(state.nameError)} aria-describedby={state.nameError ? 'profile-name-error' : undefined}
										className={cn(form.input, 'w-full disabled:opacity-50', state.nameError && 'border-error-600')} />
									{state.nameError && <p id="profile-name-error" role="alert" className={form.error}>{state.nameError}</p>}
									<div className="mt-6 space-y-5">
						<div>
							<label htmlFor="profile-email" className={cn(form.label, 'block')}>E-mail de acesso</label>
							<input id="profile-email" name="email" type="email" autoComplete="email" readOnly value={profile.email}
								aria-label="E-mail de acesso, somente leitura" className={cn(form.input, 'w-full select-text read-only:cursor-not-allowed read-only:opacity-40')} />
						</div>
						<div>
							<label htmlFor="profile-created-at" className={cn(form.label, 'block')}>Membro desde</label>
							{profile.createdAt ? <input id="profile-created-at" name="createdAt" type="date" disabled
								value={profile.createdAt.toISOString().slice(0, 10)} aria-label="Membro desde, somente leitura"
								className={cn(form.input, 'w-full disabled:cursor-not-allowed disabled:opacity-40')} /> :
												<p className={ui.body}>Data não disponível</p>}
										</div>
									</div>
									<div className="mt-6 flex flex-wrap gap-3">
										<button type="submit" disabled={state.saving || !state.dirty} aria-busy={state.saving} className={cn(ui.primaryButton, 'min-h-12 px-5 font-bold text-lumus-on-accent')}>
											{state.saving ? 'Salvando…' : 'Salvar alterações'}
										</button>
										{state.dirty && <button type="button" disabled={state.saving} onClick={state.reset} className={cn(ui.secondaryButton, ui.focusRing, 'min-h-12 px-5 disabled:opacity-50')}>Descartar alterações</button>}
									</div>
									<p className={form.helper}>{state.dirty ? 'Você tem alterações não salvas.' : 'Altere seu nome para salvar.'}</p>
									<div role="status" aria-live="polite" aria-atomic="true" className="mt-4">
										{state.feedback && <p className={state.feedback.error ? ui.errorText : ui.successText}>{state.feedback.text}</p>}
									</div>
								</form>
							</section>
							<section aria-labelledby="profile-sharing-heading" className={cn(ui.card, 'min-w-0 self-start p-5')}>
								<h2 id="profile-sharing-heading" className={cn(ui.heading, 'text-lg font-bold')}>Contas vinculadas</h2>
								<p className={cn(ui.helper, 'mt-2 text-sm')}>Vincule outra pessoa para compartilhar a visualização de gastos e ganhos.</p>
								<p className={cn(form.label, 'mt-6')}>Seu ID</p>
								<p className={cn(ui.body, 'select-text break-all text-sm')}>{profile.uid}</p>
								<button type="button" onClick={() => void state.copyId()} className={cn(ui.secondaryButton, ui.focusRing, 'mt-3 inline-flex min-h-12 items-center justify-center gap-2 px-4')}><Copy size={18} aria-hidden />Copiar meu ID</button>
								{isRouteVisible('addUserRelation') && <Link href={createAppHref(APP_ROUTE_PATHS.addUserRelation, { fromProfile: '1' })} className={cn(ui.secondaryButton, ui.focusRing, 'mt-5 flex min-h-12 items-center justify-center gap-2 px-4 no-underline')}><UsersRound size={18} aria-hidden />Relacionar usuário</Link>}
							</section>
						</div>
					) : null}
				</div>
			</main>
			<Navigator defaultValue={2} profileDisplayName={profile?.name} />
		</div>
	);
}
