import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { copyPdfToNamedCacheFile } from '@/utils/pdfFileName';
import type { HtmlReportExportRequest, HtmlReportExportResult } from '@/utils/reportExport.types';

export type { HtmlReportExportRequest, HtmlReportExportResult } from '@/utils/reportExport.types';

export const exportHtmlReport = async ({
	html,
	fileName,
	dialogTitle,
	isCurrent,
}: HtmlReportExportRequest): Promise<HtmlReportExportResult> => {
	if (isCurrent?.() === false) return { status: 'cancelled' };
	const { uri } = await Print.printToFileAsync({ html });
	let namedPdfUri: string | undefined;
	try {
		if (isCurrent?.() === false) return { status: 'cancelled' };
		namedPdfUri = await copyPdfToNamedCacheFile(uri, fileName, Boolean(isCurrent));
		if (isCurrent?.() === false) return { status: 'cancelled' };
		const canShare = await Sharing.isAvailableAsync();
		if (isCurrent?.() === false) return { status: 'cancelled' };
		if (!canShare) {
			await Print.printAsync({ html });
			return { status: 'printed' };
		}
		await Sharing.shareAsync(namedPdfUri, {
			dialogTitle,
			mimeType: 'application/pdf',
			UTI: 'com.adobe.pdf',
		});
		return { status: 'shared' };
	} finally {
		const { deleteAsync } = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
		await Promise.all([...new Set([uri, ...(namedPdfUri ? [namedPdfUri] : [])])]
			.map(path => deleteAsync(path, { idempotent: true }).catch(() => undefined)));
	}
};
