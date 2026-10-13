import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'script/release.js'), 'utf8');

function executeRelease(failingArguments?: string) {
	const calls: string[] = [];
	const releaseProcess = { argv: ['node', 'release.js', 'deploy-backend', 'production'], env: {}, exitCode: 0 };
	vm.runInNewContext(source, {
		__dirname: path.join(root, 'script'),
		process: releaseProcess,
		console: { log: jest.fn(), error: jest.fn() },
		require: (name: string) => {
			if (name === 'node:child_process') return {
				spawnSync: (command: string, args: string[]) => {
					const invocation = `${command} ${args.join(' ')}`;
					calls.push(invocation);
					return { status: invocation === failingArguments ? 1 : 0, stdout: '' };
				},
			};
			if (name === 'node:fs') return {
				...fs,
				mkdtempSync: () => '/tmp/lumus-release-test',
				existsSync: () => true,
				rmSync: () => undefined,
			};
			return require(name);
		},
	});
	return { calls, exitCode: releaseProcess.exitCode };
}

test.each(['npm audit --audit-level=high', 'npm --prefix backend audit --audit-level=high'])
('release stops before deployment when dependency verification fails: %s', audit => {
	const result = executeRelease(audit);
	expect(result.exitCode).toBe(1);
	expect(result.calls.some(call => call.includes(' deploy '))).toBe(false);
});

test('App Check verification failure prevents deployment', () => {
	const result = executeRelease('npm --prefix backend run test:app-check:emulator');
	expect(result.exitCode).toBe(1);
	expect(result.calls).toContain('npm run test:integration');
	expect(result.calls.some(call => call.includes(' deploy '))).toBe(false);
});

test('deployment follows successful dependency, integration and App Check gates', () => {
	const result = executeRelease();
	expect(result.exitCode).toBe(0);
	const appCheck = result.calls.indexOf('npm --prefix backend run test:app-check:emulator');
	const deployment = result.calls.findIndex(call => call.includes(' deploy '));
	expect(appCheck).toBeGreaterThan(result.calls.indexOf('npm run test:integration'));
	expect(deployment).toBeGreaterThan(appCheck);
});
