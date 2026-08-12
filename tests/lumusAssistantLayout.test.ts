import { getLumusAssistantViewportLayout } from '@/utils/lumusAssistantLayout';

describe('Lumus Assistant viewport layout', () => {
	it('preserves the regular hero and overlap when the viewport is expanded', () => {
		expect(
			getLumusAssistantViewportLayout({
				defaultHeroHeight: 296,
				viewportHeight: 900,
				expandedViewportHeight: 900,
			}),
		).toEqual({
			isCompact: false,
			heroHeight: 296,
			panelTopMargin: 232,
		});
	});

	it('compacts the hero when the Android keyboard removes at least 120px of viewport', () => {
		expect(
			getLumusAssistantViewportLayout({
				defaultHeroHeight: 296,
				viewportHeight: 612,
				expandedViewportHeight: 900,
			}),
		).toEqual({
			isCompact: true,
			heroHeight: 112,
			panelTopMargin: 64,
		});
	});

	it('never returns negative geometry for a very small viewport', () => {
		const layout = getLumusAssistantViewportLayout({
			defaultHeroHeight: 48,
			viewportHeight: 20,
			expandedViewportHeight: 160,
		});

		expect(layout).toEqual({
			isCompact: true,
			heroHeight: 48,
			panelTopMargin: 48,
		});
		expect(layout.heroHeight).toBeGreaterThanOrEqual(0);
		expect(layout.panelTopMargin).toBeGreaterThanOrEqual(0);
	});
});
