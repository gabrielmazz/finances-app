import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { copyPdfToNamedCacheFile } from '@/utils/pdfFileName';
import type { HtmlReportExportRequest, HtmlReportExportResult } from '@/utils/reportExport.types';

export type { HtmlReportExportRequest, HtmlReportExportResult } from '@/utils/reportExport.types';

export const exportHtmlReport = async ({
	html,
	fileName,
	dialogTitle,
}: HtmlReportExportRequest): Promise<HtmlReportExportResult> => {
	const { uri } = await Print.printToFileAsync({ html });
	const namedPdfUri = await copyPdfToNamedCacheFile(uri, fileName);
	const canShare = await Sharing.isAvailableAsync();

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
