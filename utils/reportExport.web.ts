import type { HtmlReportExportRequest, HtmlReportExportResult } from '@/utils/reportExport.types';

export type { HtmlReportExportRequest, HtmlReportExportResult } from '@/utils/reportExport.types';

export const exportHtmlReport = async ({
	html,
	fileName,
}: HtmlReportExportRequest): Promise<HtmlReportExportResult> => {
	if (typeof window === 'undefined') {
		return { status: 'popup-blocked' };
	}

	const reportWindow = window.open('', '_blank');
	if (!reportWindow) {
		return { status: 'popup-blocked' };
	}

	try {
		reportWindow.opener = null;
	} catch {
		// Alguns navegadores não permitem alterar opener; o conteúdo é gerado localmente.
	}

	reportWindow.document.open();
	reportWindow.document.write(html);
	reportWindow.document.close();
	reportWindow.document.title = fileName.replace(/\.pdf$/i, '');
	reportWindow.focus();
	reportWindow.print();

	return { status: 'printed' };
};
