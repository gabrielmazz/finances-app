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
	const cancel = async (namedUri?: string): Promise<HtmlReportExportResult> => {
		const { deleteAsync } = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
		await Promise.all([...new Set([uri, ...(namedUri ? [namedUri] : [])])].map(path => deleteAsync(path, { idempotent: true }).catch(() => undefined)));
		return { status: 'cancelled' };
	};
	if (isCurrent?.() === false) return cancel();
	const namedPdfUri = await copyPdfToNamedCacheFile(uri, fileName, Boolean(isCurrent));
	if (isCurrent?.() === false) return cancel(namedPdfUri);
	const canShare = await Sharing.isAvailableAsync();
	if (isCurrent?.() === false) return cancel(namedPdfUri);

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
};
