export type HtmlReportExportRequest = {
	html: string;
	fileName: string;
	dialogTitle: string;
	isCurrent?: () => boolean;
};

export type HtmlReportExportResult =
	| { status: 'shared' }
	| { status: 'printed' }
	| { status: 'popup-blocked' }
	| { status: 'cancelled' };
