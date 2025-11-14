const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(
	async () => {
		const config = await getDefaultConfig(__dirname);
		const { assetExts, sourceExts } = config.resolver ?? { assetExts: [], sourceExts: [] };

		return {
			...config,
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
