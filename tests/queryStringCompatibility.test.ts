import { execFileSync } from 'node:child_process';

describe('Expo Router query string decoder', () => {
	it('decodes encoded and repeated parameters using the installed router', () => {
		const result = execFileSync(process.execPath, ['-e', `
			const {getStateFromPath} = require('expo-router/build/fork/getStateFromPath');
			const state = getStateFromPath('/test?nome=Jo%C3%A3o&item=1&item=2', {screens: {test: 'test'}});
			process.stdout.write(JSON.stringify(state.routes[0].params));
		`], { encoding: 'utf8' });
		expect(JSON.parse(result)).toEqual({ nome: 'João', item: ['1', '2'] });
	});
});
