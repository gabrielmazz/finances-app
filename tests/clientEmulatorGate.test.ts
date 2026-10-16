import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const script = path.resolve(__dirname, '../script');
const source = fs.readFileSync(path.join(script, 'test_client_emulators.js'), 'utf8');
const localEnvironment = {
	FIREBASE_PROJECT_ID: 'demo-lumus-financas', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
	FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001',
};

function execute(env: Record<string, string>, status = 0) {
	const spawnSync = jest.fn(() => ({ status }));
	const childProcess = { env, execPath: process.execPath, exitCode: 0 };
	const context: Record<string, unknown> = { __dirname: script, process: childProcess };
	const load = (name: string): unknown => {
		if (name === './check_assistant_emulator_target') {
			return vm.runInNewContext(fs.readFileSync(path.join(script, name + '.js'), 'utf8'), context);
		}
		return name === 'node:child_process' ? { spawnSync } : require(name);
	};
	context.require = Object.assign(load, { resolve: require.resolve });
	return { run: () => vm.runInNewContext(source, context), spawnSync, childProcess };
}

test.each([
	{ FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' },
	{ FIREBASE_PROJECT_ID: 'finances-app-e8685' },
	{ FIREBASE_PROJECT_ID: 'demo-other-project' },
	{ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' },
])('client integration rejects an incompatible target before starting tests: %j', overrides => {
	const runner = execute({ ...localEnvironment, ...overrides });
	expect(runner.run).toThrow();
	expect(runner.spawnSync).not.toHaveBeenCalled();
});

test('client integration enables all functional suites and removes inherited family filters', () => {
	const runner = execute({ ...localEnvironment, ASSISTANT_BATCH_EMULATOR_FAMILIES: 'expense',
		RUN_ASSISTANT_EMULATOR_READS: '0' }, 1);
	runner.run();
	const [, args, options] = runner.spawnSync.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }];
	expect(args).toEqual(expect.arrayContaining([
		'tests/lumusAssistantLegacyEmulator.test.ts', 'tests/lumusAssistantBatchEmulator.test.ts',
		'tests/lumusAssistantConversationEmulator.test.ts', 'tests/ledgerProjectionEmulator.test.ts',
	]));
	expect(options.env).toMatchObject({ RUN_ASSISTANT_BATCH_EMULATOR: '1',
		RUN_ASSISTANT_EMULATOR_CONVERSATION: '1', RUN_ASSISTANT_EMULATOR_READS: '1' });
	expect(options.env).not.toHaveProperty('ASSISTANT_BATCH_EMULATOR_FAMILIES');
	expect(runner.childProcess.exitCode).toBe(1);
});
