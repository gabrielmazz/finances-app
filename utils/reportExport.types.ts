export type HtmlReportExportRequest = {
	html: string;
	fileName: string;
	dialogTitle: string;
};

export type HtmlReportExportResult =
	| { status: 'shared' }
	| { status: 'printed' }
	| { status: 'popup-blocked' };
