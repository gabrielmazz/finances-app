export type LumusAssistantViewportLayoutInput = {
	defaultHeroHeight: number;
	viewportHeight: number;
	expandedViewportHeight: number;
};

export type LumusAssistantViewportLayout = {
	isCompact: boolean;
	heroHeight: number;
	panelTopMargin: number;
};

const KEYBOARD_COMPACT_THRESHOLD = 120;
const COMPACT_HERO_MAX_HEIGHT = 112;
const COMPACT_PANEL_TOP_MARGIN = 64;
const PANEL_HERO_OVERLAP = 64;

const toNonNegativeFiniteNumber = (value: number) =>
	Number.isFinite(value) ? Math.max(0, value) : 0;

export const getLumusAssistantViewportLayout = ({
	defaultHeroHeight,
	viewportHeight,
	expandedViewportHeight,
}: LumusAssistantViewportLayoutInput): LumusAssistantViewportLayout => {
	const normalizedDefaultHeroHeight = toNonNegativeFiniteNumber(defaultHeroHeight);
	const normalizedViewportHeight = toNonNegativeFiniteNumber(viewportHeight);
	const normalizedExpandedViewportHeight = toNonNegativeFiniteNumber(expandedViewportHeight);
	const keyboardHeight = normalizedExpandedViewportHeight - normalizedViewportHeight;
	const isCompact = normalizedViewportHeight > 0 && keyboardHeight >= KEYBOARD_COMPACT_THRESHOLD;

	if (!isCompact) {
		return {
			isCompact: false,
			heroHeight: normalizedDefaultHeroHeight,
			panelTopMargin: Math.max(0, normalizedDefaultHeroHeight - PANEL_HERO_OVERLAP),
		};
	}

	const heroHeight = Math.min(normalizedDefaultHeroHeight, COMPACT_HERO_MAX_HEIGHT);

	return {
		isCompact: true,
		heroHeight,
		panelTopMargin: Math.min(heroHeight, COMPACT_PANEL_TOP_MARGIN),
	};
};
