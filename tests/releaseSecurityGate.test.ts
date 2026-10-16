import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'script/release.js'), 'utf8');

async function executeRelease(failingArguments?: string, args = ['deploy-backend', 'production']) {
	const calls: string[] = [];
	const releaseProcess = {
		argv: ['node', 'release.js', ...args], env: {}, exitCode: 0,
		stdin: { isTTY: true }, stdout: { isTTY: true },
	};
	await vm.runInNewContext(source, {
		__dirname: path.join(root, 'script'),
		process: releaseProcess,
		console: { log: jest.fn(), error: jest.fn() },
		require: (name: string) => {
			if (name === 'node:readline/promises') return {
				createInterface: () => ({ question: async () => '1', close: jest.fn() }),
			};
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

test.each([
	['deploy-backend', 'production'],
	['release', 'production'],
	['release', 'production', 'firebase'],
	['release', 'production', '1'],
])('Firebase-only release is independent of app audit findings: %j', async (...args) => {
	const result = await executeRelease('npm audit --audit-level=high', args);
	expect(result.exitCode).toBe(0);
	expect(result.calls).not.toContain('npm run check');
	expect(result.calls).not.toContain('npm audit --audit-level=high');
	expect(result.calls.some(call => call.includes(' export '))).toBe(false);
	expect(result.calls).toContain('npm --prefix backend audit --audit-level=high');
	expect(result.calls).toContain('npm --prefix backend run build');
	expect(result.calls).toContain('npm run test:integration');
	expect(result.calls).toContain('npm --prefix backend run test:app-check:emulator');
	expect(result.calls[result.calls.length - 1]).toBe(
		'npx -y firebase-tools@15.33.0 deploy --project finances-app-e8685 --only functions,firestore',
	);
});

test.each([
	'npm --prefix backend audit --audit-level=high',
	'npm --prefix backend run build',
	'npm run test:integration',
	'npm --prefix backend run test:app-check:emulator',
])('Firebase release stops before deployment when its gate fails: %s', async failure => {
	const result = await executeRelease(failure, ['release', 'production']);
	expect(result.exitCode).toBe(1);
	expect(result.calls.some(call => call.includes(' deploy '))).toBe(false);
	expect(result.calls[result.calls.length - 1]).toBe(failure);
});

test.each([
	['verify', 'production'],
	['verify-offline', 'production'],
	['deploy-web', 'production'],
	['build-android', 'production'],
	['build-android', 'production', 'production-apk'],
	['release', 'production', 'web'],
	['release', 'production', 'apk'],
	['release', 'production', 'aab'],
	['release', 'production', 'firebase,web'],
	['release', 'production', 'firebase,apk'],
	['release', 'production', 'tudo'],
])('app and combined releases retain both audit gates: %j', async (...args) => {
	for (const audit of ['npm audit --audit-level=high', 'npm --prefix backend audit --audit-level=high']) {
		const result = await executeRelease(audit, args);
		expect(result.exitCode).toBe(1);
		expect(result.calls).toContain('npm run check');
		expect(result.calls[result.calls.length - 1]).toBe(audit);
		expect(result.calls.some(call => call.includes(' deploy ') || call.startsWith('eas build '))).toBe(false);
	}
});

test('deployment follows successful dependency, integration and App Check gates', async () => {
	const result = await executeRelease();
	expect(result.exitCode).toBe(0);
	const audit = result.calls.indexOf('npm --prefix backend audit --audit-level=high');
	const build = result.calls.indexOf('npm --prefix backend run build');
	const integration = result.calls.indexOf('npm run test:integration');
	const appCheck = result.calls.indexOf('npm --prefix backend run test:app-check:emulator');
	const deployment = result.calls.findIndex(call => call.includes(' deploy '));
	expect(build).toBeGreaterThan(audit);
	expect(integration).toBeGreaterThan(build);
	expect(appCheck).toBeGreaterThan(integration);
	expect(deployment).toBeGreaterThan(appCheck);
});

test('combined release runs full verification once and publishes only selected targets', async () => {
	const result = await executeRelease(undefined, ['release', 'production', 'firebase,apk']);
	expect(result.exitCode).toBe(0);
	expect(result.calls.filter(call => call === 'npm run check')).toHaveLength(1);
	expect(result.calls.filter(call => call === 'npm audit --audit-level=high')).toHaveLength(1);
	expect(result.calls.filter(call => call === 'npm --prefix backend audit --audit-level=high')).toHaveLength(1);
	expect(result.calls.some(call => call.includes('export --platform android'))).toBe(true);
	expect(result.calls.some(call => call.includes('export --platform web'))).toBe(true);
	expect(result.calls.slice(-2)).toEqual([
		'npx -y firebase-tools@15.33.0 deploy --project finances-app-e8685 --only functions,firestore',
		'eas build --platform android --profile production-apk',
	]);
});
