import fs from 'node:fs';
import path from 'node:path';

const appDirectory = path.join(process.cwd(), 'app');
const platformDirectories = {
	web: path.join(appDirectory, 'web'),
	mobile: path.join(appDirectory, 'mobile'),
} as const;

const platformRouteFiles = (platform: keyof typeof platformDirectories) =>
	fs.readdirSync(platformDirectories[platform]).filter(fileName => fileName.endsWith('.tsx'));

describe('adaptadores de rota por plataforma', () => {
	it('mantém cada variante Web e nativa ao lado do fallback no diretório correto', () => {
		const webRouteFiles = platformRouteFiles('web');
		const mobileRouteFiles = platformRouteFiles('mobile');

		for (const [platform, routeFiles, suffix, expectedTarget] of [
			['web', webRouteFiles, 'web', '@/screens/web/'],
			['mobile', mobileRouteFiles, 'native', '@/screens/mobile/'],
		] as const) {
			for (const routeFile of routeFiles) {
				const platformMatch = routeFile.match(new RegExp(`^(.*)\\.${suffix}\\.tsx$`));
				if (!platformMatch) continue;

				const [, routeName] = platformMatch;
				const fallbackFile = `${routeName}.tsx`;
				const source = fs.readFileSync(path.join(platformDirectories[platform], routeFile), 'utf8');

				expect(routeFiles).toContain(fallbackFile);
				expect(source).toContain(expectedTarget);
			}
		}

		const webFallbacks = webRouteFiles
			.filter(fileName => fileName.endsWith('.tsx') && !fileName.match(/\.(web|native)\.tsx$/))
			.sort();
		const mobileFallbacks = mobileRouteFiles
			.filter(fileName => fileName.endsWith('.tsx') && !fileName.match(/\.(web|native)\.tsx$/))
			.sort();

		expect(webFallbacks).toEqual(mobileFallbacks);
	});

	it('mantém apenas o entrypoint e o layout na raiz de app/', () => {
		const rootRouteFiles = fs
			.readdirSync(appDirectory)
			.filter(fileName => fileName.endsWith('.tsx'))
			.sort();

		expect(rootRouteFiles).toEqual(['_layout.tsx', 'index.tsx']);
	});
});
