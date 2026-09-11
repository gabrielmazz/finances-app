/**
 * Lumus visual contracts.
 *
 * Tailwind/NativeWind classes are the canonical presentation API. Resolved
 * values in `LUMUS_RUNTIME_COLORS` exist only for native, canvas, SVG and
 * third-party APIs that cannot consume `className`.
 */

export const LUMUS_RUNTIME_COLORS = {
	light: {
		canvas: '#F8FAFC',
		surface: '#FFFFFF',
		surfaceMuted: '#F8FAFC',
		elevatedSurface: '#FFFFFF',
		border: '#E2E8F0',
		text: '#0F172A',
		textMuted: '#64748B',
		accent: '#FACC15',
		accentStrong: '#CA8A04',
		onAccent: '#0F172A',
		income: '#059669',
		expense: '#DC2626',
		focus: '#CA8A04',
		controlTrack: '#CBD5E1',
		infoBorder: '#E2E8F0',
		infoSurface: '#FFFFFF',
		skeleton: '#E2E8F0',
		skeletonMuted: '#F1F5F9',
		skeletonHighlight: 'rgba(255,255,255,0.55)',
		skeletonMutedHighlight: 'rgba(255,255,255,0.70)',
	},
	dark: {
		canvas: '#020617',
		surface: '#0B1225',
		surfaceMuted: '#111B31',
		elevatedSurface: '#081120',
		border: '#1E293B',
		text: '#F8FAFC',
		textMuted: '#94A3B8',
		accent: '#FDE047',
		accentStrong: '#FACC15',
		onAccent: '#0F172A',
		income: '#34D399',
		expense: '#F87171',
		focus: '#FDE047',
		controlTrack: '#334155',
		infoBorder: 'rgba(148,163,184,0.14)',
		infoSurface: 'rgba(15,23,42,0.78)',
		skeleton: 'rgba(30,41,59,0.96)',
		skeletonMuted: 'rgba(15,23,42,0.88)',
		skeletonHighlight: 'rgba(255,255,255,0.12)',
		skeletonMutedHighlight: 'rgba(255,255,255,0.09)',
	},
} as const;

export const LUMUS_LAYOUT_TOKENS = {
	contentMaxWidth: 1180,
	compactBreakpoint: 1024,
	minimumTouchTarget: 44,
	heroMinimumHeight: 250,
	heroViewportRatio: 0.28,
} as const;

export const LUMUS_CHART_COLORS = [
	'#FACC15',
	'#F59E0B',
	'#FDE047',
	'#EAB308',
	'#FBBF24',
	'#CA8A04',
	'#FCD34D',
	'#D97706',
] as const;

export const LUMUS_NAVIGATION_COLORS = {
	light: {
		layers: ['#FFF7CC', '#FDE68A', '#FACC15'],
		accent: '#A16207',
		button: '#A16207',
		buttonOpen: '#854D0E',
	},
	dark: {
		layers: ['#1F1808', '#8A6A0A', '#FACC15'],
		accent: '#FACC15',
		button: '#E2E8F0',
		buttonOpen: '#FEF08A',
	},
} as const;

export const LUMUS_HERO_COLORS = {
	light: ['#FFE58A', '#D97706', '#EAB308'],
	dark: ['#F8BD0C', '#FACC15', '#FEFE59'],
	text: '#FFFFFF',
} as const;

export const LUMUS_FONT_STACKS = {
	sans: 'Arimo, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const;

export const LUMUS_ALERT_COLORS = {
	error: '#DC2626',
	warn: '#D97706',
	info: '#2563EB',
	success: '#16A34A',
	text: '#FFFFFF',
} as const;

export const LUMUS_CLASS_NAMES = {
	screen: 'flex-1 bg-slate-50 dark:bg-slate-950',
	surface: 'border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950',
	surfaceMuted: 'border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900',
	heading: 'text-slate-900 dark:text-slate-100',
	body: 'text-slate-700 dark:text-slate-300',
	helper: 'text-slate-500 dark:text-slate-400',
	label: 'text-slate-700 dark:text-slate-300',
	inputText: 'text-slate-900 placeholder:text-slate-500 dark:text-slate-100 dark:placeholder:text-slate-500',
	focusRing:
		'focus-visible:border-lumus-focus focus-visible:ring-2 focus-visible:ring-lumus-focus/35 data-[focus=true]:border-lumus-focus data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-lumus-focus/35',
	control:
		'min-h-control rounded-control border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950',
	controlCompact:
		'h-10 rounded-control border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950',
	textarea:
		'h-24 rounded-control border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 web:h-textarea',
	card: 'rounded-card border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950',
	cardTinted:
		'rounded-control border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80',
	cardBordered: 'rounded-control border border-slate-200 dark:border-slate-800',
	modal: 'rounded-modal border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950',
	drawer: 'rounded-l-modal border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950',
	primaryButton:
		'min-h-touch rounded-control border border-transparent bg-lumus-accent text-lumus-on-accent data-[hover=true]:bg-lumus-accent-hover data-[active=true]:bg-lumus-accent-pressed focus-visible:ring-2 focus-visible:ring-lumus-focus focus-visible:ring-offset-2 disabled:opacity-50 data-[disabled=true]:opacity-50',
	primaryButtonText: 'font-bold text-lumus-on-accent',
	secondaryButton:
		'min-h-touch rounded-control border border-slate-300 bg-slate-200 text-slate-700 data-[hover=true]:bg-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:data-[hover=true]:bg-slate-700',
	errorText: 'text-red-600 dark:text-red-400',
	warningText: 'text-amber-700 dark:text-amber-300',
	successText: 'text-emerald-600 dark:text-emerald-400',
	incomeText: 'text-lumus-income-light dark:text-lumus-income-dark',
	expenseText: 'text-lumus-expense-light dark:text-lumus-expense-dark',
	iconButton:
		'h-touch w-touch items-center justify-center rounded-control focus-visible:ring-2 focus-visible:ring-lumus-focus',
	divider: 'border-slate-200 dark:border-slate-800',
} as const;

export const LUMUS_FORM_CLASS_NAMES = {
	label: `mb-2 ml-1 text-xs font-bold uppercase tracking-label ${LUMUS_CLASS_NAMES.label}`,
	input: `${LUMUS_CLASS_NAMES.control} ${LUMUS_CLASS_NAMES.inputText} ${LUMUS_CLASS_NAMES.focusRing} px-3 web:h-control web:bg-transparent`,
	textarea: `${LUMUS_CLASS_NAMES.textarea} ${LUMUS_CLASS_NAMES.inputText} ${LUMUS_CLASS_NAMES.focusRing}`,
	helper: `mt-2 text-sm ${LUMUS_CLASS_NAMES.helper}`,
	error: `mt-2 text-sm ${LUMUS_CLASS_NAMES.errorText}`,
	section: `${LUMUS_CLASS_NAMES.card} px-4 py-4`,
	submit: `mt-6 ${LUMUS_CLASS_NAMES.primaryButton}`,
	selectMenu:
		'mt-1 w-full overflow-hidden rounded-control border border-slate-200 bg-white p-1 shadow-overlay dark:border-slate-800 dark:bg-slate-950',
	selectOption:
		'min-h-touch flex-row items-center rounded-xl px-3 py-2.5 web:transition-colors web:duration-fast web:hover:bg-slate-100 dark:web:hover:bg-slate-800',
	selectOptionSelected: 'bg-slate-100 dark:bg-slate-800',
	selectOptionDisabled: 'opacity-50',
} as const;
