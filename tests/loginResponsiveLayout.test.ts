import fs from 'node:fs';
import path from 'node:path';

describe('login web responsivo', () => {
	it('mantém o formulário empilhado sem encolher o cabeçalho em viewports móveis', () => {
		const source = fs.readFileSync(
			path.join(process.cwd(), 'screens/web/LoginScreen.web.tsx'),
			'utf8',
		);
		const tailwind = fs.readFileSync(path.join(process.cwd(), 'tailwind.config.js'), 'utf8');

		expect(source).toContain('min-h-login-card flex-none');
		expect(source).toContain('mb-10 shrink-0 gap-2');
		expect(source).toContain('flex-login-form py-10.5');
		expect(source).not.toContain("className={`${cardBackground} flex-[0.86]");
		expect(tailwind).toContain("'login-card': '540px'");
		expect(tailwind).toContain("'login-form': '0.86 1 0%'");
	});
});
