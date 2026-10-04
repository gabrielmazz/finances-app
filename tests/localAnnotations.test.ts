import { createLocalAnnotation, getLocalAnnotationPreview, getLocalAnnotationTitle, loadLocalAnnotations, saveLocalAnnotations, saveLocalAnnotation } from '@/utils/localAnnotations';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';

describe('anotações locais', () => {
	beforeEach(() => { (globalThis as any).__resetNotificationMockState(); });
	it('cria uma anotação vazia com datas consistentes', () => {
		const now = new Date('2026-07-22T12:00:00.000Z');
		const annotation = createLocalAnnotation(now);

		expect(annotation).toMatchObject({
			title: '',
			markdown: '',
			createdAtISO: '2026-07-22T12:00:00.000Z',
			updatedAtISO: '2026-07-22T12:00:00.000Z',
		});
		expect(annotation.id).toMatch(/^annotation-\d+-/);
	});

	it('usa títulos e prévias úteis para a lista', () => {
		expect(getLocalAnnotationTitle({ title: '   ' })).toBe('Sem título');
		expect(getLocalAnnotationPreview({ markdown: '- [ ] Comprar café\nDetalhes adicionais' })).toBe('Comprar café');
		expect(getLocalAnnotationPreview({ markdown: '# Planejamento\n<u>Hoje</u>' })).toBe('Planejamento');
		expect(getLocalAnnotationPreview({ markdown: '<u>Prazo importante</u>' })).toBe('Prazo importante');
		expect(getLocalAnnotationPreview({ markdown: '' })).toBe('Toque para começar a escrever');
	});

	it('preserva uma criação do chat quando o editor salva outra anotação em paralelo', async () => {
		const original = { ...createLocalAnnotation(), id: 'original', title: 'Viagem', markdown: 'antes' };
		await saveLocalAnnotations('owner', [original]);
		const changed = { ...original, markdown: 'depois' };
		const created = { ...createLocalAnnotation(), id: 'created', title: 'Compras', markdown: 'novo' };
		await Promise.all([
			saveLocalAnnotation('owner', changed, createAssistantRecordFingerprint(original)),
			saveLocalAnnotation('owner', created, null),
		]);
		expect((await loadLocalAnnotations('owner')).map(note => ({ id: note.id, markdown: note.markdown })).sort((a, b) => a.id.localeCompare(b.id))).toEqual([{ id: 'created', markdown: 'novo' }, { id: 'original', markdown: 'depois' }]);
	});

	it('rejeita o conteúdo obsoleto do editor, reconhece reenvio já persistido e verifica a sessão antes de salvar', async () => {
		const original = { ...createLocalAnnotation(), id: 'one', title: 'Viagem', markdown: 'antes' };
		await saveLocalAnnotation('owner', original, null);
		const changed = { ...original, markdown: 'novo' };
		await saveLocalAnnotation('owner', changed, createAssistantRecordFingerprint(original));
		await expect(saveLocalAnnotation('owner', { ...original, markdown: 'rascunho antigo' }, createAssistantRecordFingerprint(original))).rejects.toThrow('A anotação mudou');
		await expect(saveLocalAnnotation('owner', changed, createAssistantRecordFingerprint(original))).resolves.toMatchObject({ changed: false });
		await expect(saveLocalAnnotation('owner', { ...createLocalAnnotation(), id: 'another' }, null, () => false)).rejects.toThrow('A conta mudou');
		expect(await loadLocalAnnotations('owner')).toHaveLength(1);
	});
});
