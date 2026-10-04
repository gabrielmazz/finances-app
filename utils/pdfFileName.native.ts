import * as FileSystem from 'expo-file-system/legacy';

export { buildPdfFileName } from '@/utils/pdfFileNameCore';

export const copyPdfToNamedCacheFile = async (sourceUri: string, fileName: string, isolateRequest = false) => {
	if (!FileSystem.cacheDirectory) {
		return sourceUri;
	}

	const directory = isolateRequest ? `${FileSystem.cacheDirectory}assistant-report-${Date.now()}-${Math.random().toString(36).slice(2)}/` : FileSystem.cacheDirectory;
	if (isolateRequest) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
	const destinationUri = `${directory}${fileName}`;

	await FileSystem.copyAsync({
		from: sourceUri,
		to: destinationUri,
	});

	return destinationUri;
};
