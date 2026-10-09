for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_FUNCTIONS_EMULATOR_HOST']) {
	if (!/^127\.0\.0\.1:\d+$/.test(process.env[name] ?? '')) {
		throw new Error(`${name} deve apontar para um Emulator local em 127.0.0.1.`);
	}
}
if (!/^demo-/.test(process.env.FIREBASE_PROJECT_ID ?? 'demo-lumus-financas')) {
	throw new Error('O teste exige um project ID sintético demo-.');
}
