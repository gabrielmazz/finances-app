import * as FileSystem from 'expo-file-system/legacy';

export { buildPdfFileName } from '@/utils/pdfFileNameCore';

export const copyPdfToNamedCacheFile = async (sourceUri: string, fileName: string) => {
	if (!FileSystem.cacheDirectory) {
		return sourceUri;
	}

	const destinationUri = `${FileSystem.cacheDirectory}${fileName}`;

	await FileSystem.copyAsync({
		from: sourceUri,
		to: destinationUri,
	});

	return destinationUri;
};
