import { execFileSync } from 'node:child_process';

describe('Expo Router query string decoder', () => {
	it('decodes URLs with the patched ESM dependency', () => {
		const result = execFileSync(process.execPath, ['-e', `
			const query = require('query-string');
			process.stdout.write(JSON.stringify([
				query.parse('nome=Jo%C3%A3o&item=1&item=2'),
				query.parse('q=%E0%A4%A'),
			]));
		`], { encoding: 'utf8' });
		expect(JSON.parse(result)).toEqual([
			{ nome: 'João', item: ['1', '2'] },
			{ q: '%E0%A4%A' },
		]);
	});
});
