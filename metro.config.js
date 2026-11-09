const { createHash } = require('node:crypto');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(
	async () => {
		const config = await getDefaultConfig(__dirname);
		const { assetExts, sourceExts } = config.resolver ?? { assetExts: [], sourceExts: [] };

		return {
			...config,
			// Expo inlines these values; a cached production transform must never serve an emulator build.
			cacheVersion: `${config.cacheVersion || ''}:${createHash('sha256').update(JSON.stringify([process.env.EXPO_PUBLIC_FIREBASE_MODE, process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST, process.env.EXPO_PUBLIC_FIREBASE_API_KEY])).digest('hex')}`,
			transformer: {
				...config.transformer,
				babelTransformerPath: require.resolve('react-native-svg-transformer'),
			},
			resolver: {
				...config.resolver,
				assetExts: assetExts.filter(ext => ext !== 'svg'),
				sourceExts: Array.from(new Set([...sourceExts, 'cjs', 'svg'])),
			},
		};
	},
	{ input: './global.css' },
);
