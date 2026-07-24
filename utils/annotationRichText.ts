const escapeHtml = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');

const renderInlineMarkdown = (value: string) => {
	let html = escapeHtml(value);

	html = html.replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, '<u>$1</u>');
	html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

	return html;
};

const renderChecklistItem = (content: string, checked: boolean) =>
	`<li data-annotation-checklist-item="true"><button type="button" class="annotation-task-toggle" data-annotation-task-toggle="true" data-checked="${checked}" contenteditable="false" tabindex="-1" aria-pressed="${checked}" aria-label="${checked ? 'Desmarcar tarefa' : 'Marcar tarefa como concluída'}">${checked ? '☑' : '☐'}</button><span>${renderInlineMarkdown(content)}</span></li>`;

export const markdownToAnnotationEditorHtml = (markdown: string) => {
	if (!markdown) {
		return '';
	}

	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	const html: string[] = [];
	let lineIndex = 0;

	while (lineIndex < lines.length) {
		const line = lines[lineIndex];
		const heading = line.match(/^\s{0,3}(#{1,3})\s+(.*?)\s*#*\s*$/);
		const checklist = line.match(/^\s*[-*+]\s+\[([ xX])\]\s?(.*)$/);
		const bullet = line.match(/^\s*[-*+]\s+(.*)$/);

		if (heading) {
			const level = heading[1].length;
			html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
			lineIndex += 1;
			continue;
		}

		if (checklist) {
			const items: string[] = [];
			while (lineIndex < lines.length) {
				const item = lines[lineIndex].match(/^\s*[-*+]\s+\[([ xX])\]\s?(.*)$/);
				if (!item) {
					break;
				}
				items.push(renderChecklistItem(item[2], item[1].toLowerCase() === 'x'));
				lineIndex += 1;
			}
			html.push(`<ul data-annotation-list="checklist">${items.join('')}</ul>`);
			continue;
		}

		if (bullet) {
			const items: string[] = [];
			while (lineIndex < lines.length) {
				const item = lines[lineIndex].match(/^\s*[-*+]\s+(.*)$/);
				if (!item || /^\[([ xX])\]\s?/.test(item[1])) {
					break;
				}
				items.push(`<li>${renderInlineMarkdown(item[1])}</li>`);
				lineIndex += 1;
			}
			html.push(`<ul>${items.join('')}</ul>`);
			continue;
		}

		html.push(line ? `<p>${renderInlineMarkdown(line)}</p>` : '<p><br></p>');
		lineIndex += 1;
	}

	return html.join('');
};
