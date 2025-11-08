declare module '@firebase/auth' {
	/**
	 * Declaração mínima para habilitar o uso de `getReactNativePersistence` em ambientes React Native.
	 * O Firebase ainda não exporta esse helper nos tipos principais do pacote.
	 */
	export function getReactNativePersistence(storage: unknown): any;
}
