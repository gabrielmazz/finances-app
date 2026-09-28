import type { Persistence } from 'firebase/auth';

// O tsconfig usa os tipos React Native do Firebase; a entrada Web também exporta esta persistência.
declare module 'firebase/auth' {
	export const browserLocalPersistence: Persistence;
}
