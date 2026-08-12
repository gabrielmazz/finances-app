import {
	isWebDesktopLayout,
	WEB_DESKTOP_BREAKPOINT,
	WEB_SIDEBAR_GUTTER,
	WEB_SIDEBAR_WIDTH,
} from '@/utils/webLayout';

describe('layout responsivo Web', () => {
	it('usa a sidebar somente no navegador a partir de 1024px', () => {
		expect(isWebDesktopLayout('web', WEB_DESKTOP_BREAKPOINT - 1)).toBe(false);
		expect(isWebDesktopLayout('web', WEB_DESKTOP_BREAKPOINT)).toBe(true);
		expect(isWebDesktopLayout('android', 1600)).toBe(false);
		expect(isWebDesktopLayout('ios', 1600)).toBe(false);
	});

	it('mantém as dimensões do espaço reservado para a navegação desktop', () => {
		expect(WEB_SIDEBAR_WIDTH).toBe(256);
		expect(WEB_SIDEBAR_GUTTER).toBe(16);
	});
});
