import { createLocalAnnotation, getLocalAnnotationPreview, getLocalAnnotationTitle } from '@/utils/localAnnotations';

describe('anotações locais', () => {
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
});
