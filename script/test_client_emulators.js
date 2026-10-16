#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

require('./check_assistant_emulator_target');
// As suítes de conversa/lotes/leitores usam este projeto e estas portas fixas.
for (const [name, expected] of Object.entries({
	FIREBASE_PROJECT_ID: 'demo-lumus-financas',
	FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
	FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
	FIREBASE_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001',
})) {
	if (process.env[name] !== expected) throw new Error(`${name} deve ser ${expected} para estas suítes.`);
}

// [[Processo de Release]]: habilitar as quatro suítes funcionais, sem filtro herdado.
const env = { ...process.env, RUN_ASSISTANT_BATCH_EMULATOR: '1', RUN_ASSISTANT_EMULATOR_CONVERSATION: '1',
	RUN_ASSISTANT_EMULATOR_READS: '1', MEASURE_ASSISTANT_REAL_BATCH: '', MEASURE_ASSISTANT_EMULATOR_READS: '' };
delete env.ASSISTANT_BATCH_EMULATOR_FAMILIES;
const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--runInBand', '--runTestsByPath',
	'tests/lumusAssistantLegacyEmulator.test.ts', 'tests/lumusAssistantBatchEmulator.test.ts',
	'tests/lumusAssistantConversationEmulator.test.ts', 'tests/ledgerProjectionEmulator.test.ts',
], {
	cwd: path.resolve(__dirname, '..'), stdio: 'inherit',
	env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
