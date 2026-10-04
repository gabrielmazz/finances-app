const mockPrintToFile = jest.fn(); const mockPrint = jest.fn(); const mockShare = jest.fn(); const mockCanShare = jest.fn(); const mockCopy = jest.fn(); const mockDelete = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('expo-print', () => ({ printToFileAsync: (...args: unknown[]) => mockPrintToFile(...args), printAsync: (...args: unknown[]) => mockPrint(...args) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: () => mockCanShare(), shareAsync: (...args: unknown[]) => mockShare(...args) }));
jest.mock('expo-file-system/legacy', () => ({ deleteAsync: (...args: unknown[]) => mockDelete(...args) }));
jest.mock('@/utils/pdfFileName', () => ({ copyPdfToNamedCacheFile: (...args: unknown[]) => mockCopy(...args) }));
import { exportHtmlReport as exportNative } from '@/utils/reportExport.native';
import { exportHtmlReport as exportWeb } from '@/utils/reportExport.web';

it('não abre compartilhamento depois de troca de conta durante a geração nativa e remove o arquivo temporário', async () => {
 let current = true;
 mockPrintToFile.mockImplementation(async () => { current = false; return { uri: 'file:///temporary.pdf' }; });
 const result = await exportNative({ html: '<p>dados privados</p>', fileName: 'Relatorio.pdf', dialogTitle: 'Relatório', isCurrent: () => current });
 expect(result).toMatchObject({ status: 'cancelled' });
 expect(mockCopy).not.toHaveBeenCalled(); expect(mockShare).not.toHaveBeenCalled(); expect(mockPrint).not.toHaveBeenCalled();
 expect(mockDelete).toHaveBeenCalledWith('file:///temporary.pdf', { idempotent: true });
});

it('recusa sessão revogada antes de abrir a janela Web', async () => {
 const open = jest.fn(); const previousWindow = (globalThis as any).window;
 (globalThis as any).window = { open };
 try {
  expect(await exportWeb({ html: 'privado', fileName: 'Relatorio.pdf', dialogTitle: 'Relatório', isCurrent: () => false })).toMatchObject({ status: 'cancelled' });
  expect(open).not.toHaveBeenCalled();
 } finally { (globalThis as any).window = previousWindow; }
});
