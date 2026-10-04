import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const physicalFiles = (group: 'web' | 'mobile') => readdirSync(join(process.cwd(), 'app', group)).filter(name => name.endsWith('.tsx')).sort();
const routeName = (file: string) => file.replace(/\.(native|web)\.tsx$|\.tsx$/g, '');

it.each(['web', 'android'] as const)('compara todas as rotas físicas e adaptadores com o registro na plataforma %s', platform => {
	jest.resetModules();
	(globalThis as any).__mockNotificationState.platformOS = platform;
	jest.doMock('expo-router', () => ({ router: {} }));
	const { APP_ROUTE_PATHS, APP_PLATFORM_GROUP, APP_PLATFORM_PREFIX, ROUTE_VISIBILITY_PATHS } = require('@/utils/navigation');
	const { APP_ROUTE_GUARD_ENTRIES, isAppRouteAllowed } = require('@/utils/appRouteGuards');
	const logical = Object.values(APP_ROUTE_PATHS).map((path: unknown) => (path as string).replace(APP_PLATFORM_PREFIX, '') || '/index').sort();
	for (const group of ['web', 'mobile'] as const) {
		const files = physicalFiles(group);
		const destinations = [...new Set(files.map(routeName))];
		expect(destinations.map(name => `/${name}`).sort()).toEqual(logical);
		for (const destination of destinations) {
			const entry = APP_ROUTE_GUARD_ENTRIES.find((value: { name: string }) => value.name === `${group}/${destination}`);
			expect(entry).toBeDefined();
			expect(isAppRouteAllowed(entry, false, () => true)).toBe(group === APP_PLATFORM_GROUP && destination === 'index');
			expect(isAppRouteAllowed(entry, true, () => true)).toBe(group === APP_PLATFORM_GROUP && destination !== 'index');
			if (entry.isActivePlatform && !entry.isLogin) {
				const visibilityKey = require('@/utils/navigation').getRouteVisibilityKeyForPath(entry.pathname);
				expect(isAppRouteAllowed(entry, true, () => false)).toBe(visibilityKey === null);
			}
		}
		for (const file of files.filter(file => /\.(native|web)\.tsx$/.test(file))) {
			expect(files).toContain(`${routeName(file)}.tsx`);
		}
	}
	expect(APP_PLATFORM_GROUP).toBe(platform === 'web' ? 'web' : 'mobile');
	for (const paths of Object.values(ROUTE_VISIBILITY_PATHS) as string[][]) {
		for (const path of paths) expect(Object.values(APP_ROUTE_PATHS)).toContain(path);
	}
	jest.dontMock('expo-router');
});

it('inclui cada arquivo físico no inventário documentado e mantém guards derivados do registro e da visibilidade', () => {
	const matrix = readFileSync(join(process.cwd(), 'Arquitetura', 'Cobertura Conversacional Lumus.md'), 'utf8');
	for (const group of ['web', 'mobile'] as const) {
		for (const file of physicalFiles(group)) expect(matrix).toContain(`app/${group}/${file}`);
	}
	const guard = readFileSync(join(process.cwd(), 'components/app/app-root.tsx'), 'utf8');
	expect(guard).toContain('APP_ROUTE_GUARD_ENTRIES.map');
	expect(guard).toContain('isAppRouteAllowed(entry, isAuthenticated, isRouteVisible)');
	const home = readFileSync(join(process.cwd(), 'screens/mobile/HomeTabsScreen.tsx'), 'utf8');
	expect(home).toContain("isRouteVisible('addRegisterExpenses')");
});
