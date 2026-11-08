import fs from 'node:fs';
import path from 'node:path';

const firebaseEnv = {
	EXPO_PUBLIC_FIREBASE_API_KEY: 'api-key',
	EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'finances-app-e8685.firebaseapp.com',
	EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'finances-app-e8685',
	EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'finances-app-e8685.firebasestorage.app',
	EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'sender-id',
	EXPO_PUBLIC_FIREBASE_APP_ID: 'app-id',
	EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: 'measurement-id',
} as const;

describe('compatibilidade Web', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		jest.resetModules();
		Object.assign(process.env, firebaseEnv);
	});

	afterEach(() => {
		jest.resetModules();
		jest.dontMock('expo/virtual/env');
		jest.dontMock('expo-print');
		jest.dontMock('expo-sharing');
		jest.dontMock('expo-file-system/legacy');
		jest.dontMock('@/utils/pdfFileName');
		process.env = { ...originalEnv };
	});

	it('abre o HTML no navegador e inicia a impressão do relatório', async () => {
		const reportWindow = {
			opener: {} as Window | null,
			document: {
				open: jest.fn(),
				write: jest.fn(),
				close: jest.fn(),
				title: '',
			},
			focus: jest.fn(),
			print: jest.fn(),
		};
		const open = jest.fn(() => reportWindow);
		Object.assign(globalThis, { window: { open } });

		const { exportHtmlReport } = require('@/utils/reportExport.web') as typeof import('@/utils/reportExport.web');
		const result = await exportHtmlReport({
			html: '<html><body>Relatório</body></html>',
			fileName: 'Lumus-Financas-Relatorio.pdf',
			dialogTitle: 'Baixar relatório',
		});

		expect(result).toEqual({ status: 'printed' });
		expect(open).toHaveBeenCalledWith('', '_blank');
		expect(reportWindow.document.write).toHaveBeenCalledWith('<html><body>Relatório</body></html>');
		expect(reportWindow.document.title).toBe('Lumus-Financas-Relatorio');
		expect(reportWindow.focus).toHaveBeenCalledTimes(1);
		expect(reportWindow.print).toHaveBeenCalledTimes(1);
	});

	it('informa quando o navegador bloqueia a nova aba do relatório', async () => {
		Object.assign(globalThis, { window: { open: jest.fn(() => null) } });

		const { exportHtmlReport } = require('@/utils/reportExport.web') as typeof import('@/utils/reportExport.web');
		await expect(
			exportHtmlReport({ html: '<html></html>', fileName: 'relatorio.pdf', dialogTitle: 'Relatório' }),
		).resolves.toEqual({ status: 'popup-blocked' });
	});

	it('preserva a exportação PDF e compartilhamento nativos', async () => {
		const mockPrintToFileAsync = jest.fn(async () => ({ uri: 'file:///cache/report.pdf' }));
		const mockShareAsync = jest.fn(async () => undefined);
		jest.doMock('expo-print', () => ({
			printToFileAsync: mockPrintToFileAsync,
			printAsync: jest.fn(),
		}));
		jest.doMock('expo-sharing', () => ({
			isAvailableAsync: jest.fn(async () => true),
			shareAsync: mockShareAsync,
		}));
		jest.doMock('@/utils/pdfFileName', () => ({
			copyPdfToNamedCacheFile: jest.fn(async () => 'file:///cache/named-report.pdf'),
		}));
		const mockDeleteAsync = jest.fn(async () => undefined);
		jest.doMock('expo-file-system/legacy', () => ({ deleteAsync: mockDeleteAsync }));

		const { exportHtmlReport } = require('@/utils/reportExport.native') as typeof import('@/utils/reportExport.native');
		await expect(
			exportHtmlReport({ html: '<html></html>', fileName: 'report.pdf', dialogTitle: 'Baixar relatório' }),
		).resolves.toEqual({ status: 'shared' });
		expect(mockPrintToFileAsync).toHaveBeenCalledWith({ html: '<html></html>' });
		expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/named-report.pdf', {
			dialogTitle: 'Baixar relatório',
			mimeType: 'application/pdf',
			UTI: 'com.adobe.pdf',
		});
		expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/report.pdf', { idempotent: true });
		expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/named-report.pdf', { idempotent: true });
	});

	it('não deixa telas de relatório importarem módulos nativos diretamente', () => {
		const reportScreens = [
			'screens/mobile/CategoryAnalysisScreen.tsx',
			'screens/mobile/MandatoryExpensesListScreen.tsx',
			'screens/mobile/MandatoryGainsListScreen.tsx',
			'screens/mobile/BankMovementsScreen.tsx',
		];

		for (const screenPath of reportScreens) {
			const source = fs.readFileSync(path.join(process.cwd(), screenPath), 'utf8');
			expect(source).not.toMatch(/['\"]expo-(?:print|sharing)['\"]/);
		}
	});
});
