import * as FileSystem from 'expo-file-system/legacy';

const DEFAULT_PDF_PREFIX = 'Lumus-Financas';

const normalizePdfFileNamePart = (value: string) => {
	const normalized = value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return normalized || 'relatorio';
};

const formatPdfGeneratedAtStamp = (date = new Date()) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hour = String(date.getHours()).padStart(2, '0');
	const minute = String(date.getMinutes()).padStart(2, '0');

	return `${year}-${month}-${day}-${hour}${minute}`;
};

export const buildPdfFileName = (parts: string[], date = new Date()) => {
	const normalizedParts = [DEFAULT_PDF_PREFIX, ...parts, formatPdfGeneratedAtStamp(date)]
		.map(normalizePdfFileNamePart)
		.filter(Boolean);

	return `${normalizedParts.join('-')}.pdf`;
};

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
