const hosts = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' };
for (const [name, expected] of Object.entries(hosts)) {
	if (process.env[name] !== expected) throw new Error(`${name} deve apontar para ${expected}; esta verificação usa somente o projeto sintético demo-lumus-financas local.`);
}
