import fs from 'node:fs';
import path from 'node:path';

describe('transição de rotas Web', () => {
	it('usa Motion em um portal DOM sem alterar o Stack do Expo Router', () => {
		const source = fs.readFileSync(
			path.join(process.cwd(), 'components/uiverse/web-route-transition.web.tsx'),
			'utf8',
		);

		expect(source).toContain("from 'motion/react'");
		expect(source).toContain("lumus:web-route-transition");
		expect(source).toContain('createPortal');
		expect(source).toContain('useReducedMotion');
		expect(source).toContain('scaleX');
		expect(source).toContain("pointerEvents: 'none'");
	});

	it('monta a transição apenas no shell autenticado da Web', () => {
		const source = fs.readFileSync(
			path.join(process.cwd(), 'components/uiverse/web-app-shell.tsx'),
			'utf8',
		);

		expect(source).toContain('<WebRouteTransition />');
		expect(source).toContain('usesWorkspaceBackground');
	});

	it('mantém o Grainient do wallpaper da Home contido no hero inteiro', () => {
		const source = fs.readFileSync(path.join(process.cwd(), 'screens/HomeScreen.web.tsx'), 'utf8');
		const styles = fs.readFileSync(path.join(process.cwd(), 'hooks/useScreenStyle.ts'), 'utf8');

		expect(source).toContain('home-hero-grainient');
		expect(styles).toContain("hero: 'absolute inset-x-0 top-0 w-screen overflow-hidden'");
		expect(source).toContain('width: "100%"');
		expect(source).toContain('height: heroHeight');
	});
});
