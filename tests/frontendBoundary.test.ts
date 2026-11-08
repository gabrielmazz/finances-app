import fs from 'node:fs';
import path from 'node:path';
import { FEATURE_UNAVAILABLE_MESSAGE, unavailableAction } from '@/utils/availability';

const files = (directory: string): string[] =>
	fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(directory, entry.name);
		return entry.isDirectory() ? files(file) : /\.[jt]sx?$/.test(file) ? [file] : [];
	});

describe('base visual independente', () => {
	it('não fornece identidade fictícia nem sucesso para uma operação indisponível', () => {
		expect(unavailableAction).toThrow(FEATURE_UNAVAILABLE_MESSAGE);
	});

	it('não importa implementações ou SDKs da arquitetura removida', () => {
		const forbidden =
			/(?:from\s*|require\s*\(|import\s*\()\s*['"](?:@\/(?:functions|services|repositories)\/|@\/FirebaseConfig|firebase(?:\/|['"])|@firebase\/|@react-native-firebase\/)/;
		const violations = ['app', 'screens', 'components', 'hooks', 'utils', 'types', 'domain']
			.flatMap((directory) => files(directory))
			.filter((file) => forbidden.test(fs.readFileSync(file, 'utf8')));
		expect(violations).toEqual([]);
		for (const obsolete of [
			'backend',
			'functions',
			'services',
			'repositories',
			'firebase.json',
			'remote_config.json',
		])
			expect(fs.existsSync(obsolete)).toBe(false);
	});

	it('restringe imports Firebase aos módulos da fundação, sem APIs pagas', () => {
		const active = ['firebase', 'application', 'contexts'].flatMap(files);
		expect(active.filter((file) => /from ['"](?:firebase\/(?:functions|storage|ai|remote-config)|@react-native-firebase)/.test(fs.readFileSync(file, 'utf8')))).toEqual([]);
	});

	it('mantém todos os arquivos de tela e de rota inventariados antes da remoção', () => {
		const inventory = JSON.parse(fs.readFileSync('docs/backend-removal-manifest.json', 'utf8')) as {
			preservedScreens: string[];
			preservedRoutes: string[];
		};
		expect(files('screens').sort()).toEqual(inventory.preservedScreens);
		expect(
			files('app')
				.filter((file) => file.endsWith('.tsx'))
				.sort(),
		).toEqual(inventory.preservedRoutes);
	});
});
