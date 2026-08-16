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
		jest.dontMock('firebase/app');
		jest.dontMock('firebase/auth');
		jest.dontMock('firebase/firestore');
		jest.dontMock('firebase/functions');
		jest.dontMock('expo-print');
		jest.dontMock('expo-sharing');
		jest.dontMock('@/utils/pdfFileName');
		process.env = { ...originalEnv };
	});

	it('inicializa os dois Firebase Auths Web exclusivamente em memória', () => {
		const apps: Array<{ name: string }> = [];
		const mockInitializeApp = jest.fn((_config, name?: string) => {
			const app = { name: name ?? '[DEFAULT]' };
			apps.push(app);
			return app;
		});
		const mockGetApp = jest.fn((name?: string) => apps.find(app => app.name === (name ?? '[DEFAULT]')));
		const mockInMemoryPersistence = { type: 'NONE' };
		const mockInitializeAuth = jest.fn((app, options) => ({ app, options }));

		jest.doMock('firebase/app', () => ({
			getApps: () => apps,
			getApp: mockGetApp,
			initializeApp: mockInitializeApp,
		}));
		jest.doMock('firebase/auth', () => ({
			getAuth: jest.fn(),
			initializeAuth: mockInitializeAuth,
			inMemoryPersistence: mockInMemoryPersistence,
			connectAuthEmulator: jest.fn(),
		}));
		jest.doMock('firebase/firestore', () => ({ getFirestore: jest.fn(app => ({ app })), connectFirestoreEmulator: jest.fn() }));
		jest.doMock('firebase/functions', () => ({ getFunctions: jest.fn(app => ({ app })), connectFunctionsEmulator: jest.fn() }));
		jest.doMock('expo/virtual/env', () => ({ env: process.env }));

		const config = require('@/FirebaseConfig.web') as typeof import('@/FirebaseConfig.web');

		expect(mockInitializeAuth).toHaveBeenCalledTimes(2);
		expect(mockInitializeAuth).toHaveBeenNthCalledWith(1, config.app, {
			persistence: mockInMemoryPersistence,
		});
		expect(mockInitializeAuth).toHaveBeenNthCalledWith(2, config.secondaryApp, {
			persistence: mockInMemoryPersistence,
		});
		expect(config.auth).not.toBe(config.secondaryAuth);
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
	});

	it('mantém lembretes agendados indisponíveis no navegador sem carregar o módulo nativo', async () => {
		const mockScheduleNotificationAsync = jest.fn();
		jest.doMock('expo-notifications', () => ({ scheduleNotificationAsync: mockScheduleNotificationAsync }));
		const notificationState = (globalThis as typeof globalThis & {
			__mockNotificationState: { platformOS: string };
		}).__mockNotificationState;
		notificationState.platformOS = 'web';

		const { ensureLocalNotificationPermission, isNotificationsEnvironmentSupported } =
			require('@/utils/localNotifications') as typeof import('@/utils/localNotifications');

		expect(isNotificationsEnvironmentSupported()).toBe(false);
		await expect(ensureLocalNotificationPermission()).resolves.toEqual({ granted: false, reason: 'unavailable' });
		expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
	});

	it('não deixa telas de relatório importarem módulos nativos diretamente', () => {
		const reportScreens = [
			'screens/CategoryAnalysisScreen.tsx',
			'screens/MandatoryExpensesListScreen.tsx',
			'screens/MandatoryGainsListScreen.tsx',
			'screens/BankMovementsScreen.tsx',
		];

		for (const screenPath of reportScreens) {
			const source = fs.readFileSync(path.join(process.cwd(), screenPath), 'utf8');
			expect(source).toContain("@/utils/reportExport");
			expect(source).not.toMatch(/['\"]expo-(?:print|sharing)['\"]/);
		}
	});
});
