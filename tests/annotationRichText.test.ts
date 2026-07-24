import { markdownToAnnotationEditorHtml } from '@/utils/annotationRichText';

describe('Markdown visual das anotações locais', () => {
	it('mostra títulos sem expor os marcadores de Markdown', () => {
		expect(markdownToAnnotationEditorHtml('# Planejamento\n## Esta semana\n### Hoje')).toBe(
			'<h1>Planejamento</h1><h2>Esta semana</h2><h3>Hoje</h3>',
		);
	});

	it('converte as marcações de ênfase para elementos visuais', () => {
		expect(markdownToAnnotationEditorHtml('**Importante** e *urgente* com <u>prazo</u>.')).toBe(
			'<p><strong>Importante</strong> e <em>urgente</em> com <u>prazo</u>.</p>',
		);
	});

	it('mantém tópicos e checklists como estruturas distintas', () => {
		expect(markdownToAnnotationEditorHtml('- Café\n- Leite')).toBe('<ul><li>Café</li><li>Leite</li></ul>');
		expect(markdownToAnnotationEditorHtml('- [ ] Estudar\n- [x] Revisar')).toContain(
			'<ul data-annotation-list="checklist">',
		);
		expect(markdownToAnnotationEditorHtml('- [ ] Estudar\n- [x] Revisar')).toContain('data-checked="true"');
	});

	it('escapa conteúdo comum antes de inseri-lo no editor', () => {
		expect(markdownToAnnotationEditorHtml('<script>alert(1)</script>')).toBe(
			'<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
		);
	});
});
