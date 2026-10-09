import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('version:set', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumus-version-test-'));
	const script = path.join(root, 'script', 'update_app_version.js');

	beforeAll(() => {
		fs.mkdirSync(path.dirname(script), { recursive: true });
		fs.mkdirSync(path.join(root, 'screens', 'mobile'), { recursive: true });
		fs.mkdirSync(path.join(root, 'screens', 'web'), { recursive: true });
		fs.copyFileSync(path.join(process.cwd(), 'script', 'update_app_version.js'), script);
		fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { version: '2.3.0' } }));
		fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'finances-app', version: '2.3.0' }));
		fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'finances-app', version: '2.3.0', packages: { '': { name: 'finances-app', version: '2.3.0' } } }));
		for (const file of ['screens/mobile/LoginScreen.tsx', 'screens/web/LoginScreen.web.tsx']) {
			fs.writeFileSync(path.join(root, file), '<Text>Versão 2.3.0</Text>');
		}
	});

	afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

	it('updates the app, package, lockfile and both login labels together', () => {
		const result = spawnSync(process.execPath, [script, '2.3.1'], { encoding: 'utf8' });
		expect(result.status).toBe(0);
		expect(JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.version).toBe('2.3.1');
		expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe('2.3.1');
		const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
		expect([lock.version, lock.packages[''].version]).toEqual(['2.3.1', '2.3.1']);
		for (const file of ['screens/mobile/LoginScreen.tsx', 'screens/web/LoginScreen.web.tsx']) {
			expect(fs.readFileSync(path.join(root, file), 'utf8')).toContain('Versão 2.3.1');
		}
	});
});
