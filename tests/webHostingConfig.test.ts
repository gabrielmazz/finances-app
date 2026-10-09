const appConfig = require('../app.json');
const firebaseConfig = require('../firebase.json');
const packageConfig = require('../package.json');
const { readFileSync } = require('node:fs');
const firebaseProjectConfig = JSON.parse(readFileSync(`${__dirname}/../.firebaserc`, 'utf8'));

describe('configuração da versão Web no Firebase Hosting', () => {
	it('gera uma SPA Web com tema automático', () => {
		expect(appConfig.expo.userInterfaceStyle).toBe('automatic');
		expect(appConfig.expo.web.output).toBe('single');
	});

	it('serve o export do Expo e preserva deep links do Router', () => {
		expect(firebaseConfig.hosting).toEqual(
			expect.objectContaining({
				public: 'dist',
				cleanUrls: true,
			}),
		);
		expect(firebaseConfig.hosting.rewrites).toContainEqual({
			source: '**',
			destination: '/index.html',
		});
		expect(firebaseProjectConfig.projects.default).toBe('demo-lumus-financas');
		expect(firebaseProjectConfig.projects.production).toBe('finances-app-e8685');
	});

	it('exporta, serve localmente e publica Hosting através do gate de release', () => {
		expect(packageConfig.scripts['web:export']).toBe('expo export --platform web');
		expect(packageConfig.scripts['web:serve']).toContain('firebase-tools@15.33.0 emulators:start --project emulator --only hosting');
		expect(packageConfig.scripts['web:deploy']).toBe('node script/release.js deploy-web production');
		expect(packageConfig.scripts['web:deploy:preview']).toContain('release.js deploy-web preview');
		expect(packageConfig.scripts['web:deploy:preview']).toContain('eas env:exec preview');
		expect(packageConfig.scripts['firebase:deploy:preview']).toContain('release.js deploy-backend preview');
		expect(packageConfig.scripts['firebase:deploy:production']).toBe('node script/release.js deploy-backend production');
		expect(firebaseConfig.functions[0].predeploy).toContain('npm --prefix backend run build');
	});
});
