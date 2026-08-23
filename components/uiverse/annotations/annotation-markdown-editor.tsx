'use dom';

import { useCallback, useEffect, useRef, type MouseEvent } from 'react';
import type { DOMProps } from 'expo/dom';

import { markdownToAnnotationEditorHtml } from '@/utils/annotationRichText';

type AnnotationMarkdownEditorProps = {
	markdown: string;
	isDarkMode: boolean;
	onChangeMarkdown: (markdown: string) => Promise<void>;
	dom?: DOMProps;
};

type ToolbarAction =
	'heading1' | 'heading2' | 'heading3' | 'bold' | 'italic' | 'underline' | 'bulletList' | 'checklist';

type ToolbarItem = {
	action: ToolbarAction;
	label: string;
	symbol: string;
};

const TOOLBAR_ITEMS: readonly ToolbarItem[] = [
	{ action: 'heading1', label: 'Título nível 1', symbol: 'H1' },
	{ action: 'heading2', label: 'Título nível 2', symbol: 'H2' },
	{ action: 'heading3', label: 'Título nível 3', symbol: 'H3' },
	{ action: 'bold', label: 'Negrito', symbol: 'B' },
	{ action: 'italic', label: 'Itálico', symbol: 'I' },
	{ action: 'underline', label: 'Sublinhado', symbol: 'U' },
	{ action: 'bulletList', label: 'Tópicos', symbol: '•≡' },
	{ action: 'checklist', label: 'Checklist', symbol: '☑' },
];

const isElement = (node: Node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE;

const inlineNodesToMarkdown = (nodes: Node[]): string =>
	nodes
		.map((node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				return node.textContent ?? '';
			}

			if (!isElement(node)) {
				return '';
			}

			if (node.dataset.annotationTaskToggle === 'true') {
				return '';
			}

			const content = inlineNodesToMarkdown(Array.from(node.childNodes));
			switch (node.tagName) {
				case 'BR':
					return '\n';
				case 'B':
				case 'STRONG':
					return `**${content}**`;
				case 'I':
				case 'EM':
					return `*${content}*`;
				case 'U':
					return `<u>${content}</u>`;
				default:
					return content;
			}
		})
		.join('');

const getChecklistButton = (listItem: HTMLLIElement) =>
	Array.from(listItem.children).find(
		(child): child is HTMLButtonElement =>
			child instanceof HTMLButtonElement && child.dataset.annotationTaskToggle === 'true',
	);

const listItemToMarkdown = (listItem: HTMLLIElement, checklist: boolean) => {
	const content = inlineNodesToMarkdown(Array.from(listItem.childNodes)).trim();
	if (checklist) {
		const checked = getChecklistButton(listItem)?.dataset.checked === 'true';
		return `- [${checked ? 'x' : ' '}] ${content}`;
	}

	return `- ${content}`;
};

const blockNodeToMarkdown = (node: Node) => {
	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent ?? '';
	}

	if (!isElement(node)) {
		return '';
	}

	const content = inlineNodesToMarkdown(Array.from(node.childNodes)).trim();
	switch (node.tagName) {
		case 'H1':
			return `# ${content}`;
		case 'H2':
			return `## ${content}`;
		case 'H3':
			return `### ${content}`;
		case 'UL': {
			const checklist = node.dataset.annotationList === 'checklist';
			return Array.from(node.children)
				.filter((child): child is HTMLLIElement => child instanceof HTMLLIElement)
				.map((listItem) => listItemToMarkdown(listItem, checklist))
				.join('\n');
		}
		case 'OL':
			return Array.from(node.children)
				.filter((child): child is HTMLLIElement => child instanceof HTMLLIElement)
				.map((listItem, index) => `${index + 1}. ${inlineNodesToMarkdown(Array.from(listItem.childNodes)).trim()}`)
				.join('\n');
		case 'DIV':
		case 'P':
			return content;
		default:
			return inlineNodesToMarkdown(Array.from(node.childNodes)).trim();
	}
};

const editorToMarkdown = (editor: HTMLElement) =>
	Array.from(editor.childNodes)
		.map(blockNodeToMarkdown)
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trimEnd();

const setChecklistButtonState = (button: HTMLButtonElement, checked: boolean) => {
	button.dataset.checked = String(checked);
	button.textContent = checked ? '☑' : '☐';
	button.setAttribute('aria-label', checked ? 'Desmarcar tarefa' : 'Marcar tarefa como concluída');
	button.setAttribute('aria-pressed', String(checked));
};

const decorateChecklist = (list: HTMLUListElement) => {
	list.dataset.annotationList = 'checklist';
	Array.from(list.children)
		.filter((child): child is HTMLLIElement => child instanceof HTMLLIElement)
		.forEach((listItem) => {
			let button = getChecklistButton(listItem);
			if (!button) {
				button = document.createElement('button');
				button.type = 'button';
				button.className = 'annotation-task-toggle';
				button.dataset.annotationTaskToggle = 'true';
				button.setAttribute('contenteditable', 'false');
				button.tabIndex = -1;
				listItem.insertBefore(button, listItem.firstChild);
			}

			setChecklistButtonState(button, button.dataset.checked === 'true');
		});
};

const getSelectedList = () => {
	const selection = window.getSelection();
	const anchor = selection?.anchorNode;
	const element = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
	return element?.closest('ul');
};

export default function AnnotationMarkdownEditor({
	markdown,
	isDarkMode,
	onChangeMarkdown,
}: AnnotationMarkdownEditorProps) {
	const editorRef = useRef<HTMLDivElement>(null);

	const emitMarkdown = useCallback(() => {
		const editor = editorRef.current;
		if (!editor) {
			return;
		}

		void onChangeMarkdown(editorToMarkdown(editor));
	}, [onChangeMarkdown]);

	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || markdown === editorToMarkdown(editor)) {
			return;
		}

		editor.innerHTML = markdownToAnnotationEditorHtml(markdown);
	}, [markdown]);

	const focusEditor = useCallback(() => {
		const editor = editorRef.current;
		if (!editor) {
			return null;
		}

		editor.focus();
		if (!editor.childNodes.length) {
			editor.innerHTML = '<p><br></p>';
			const range = document.createRange();
			range.selectNodeContents(editor.firstChild!);
			range.collapse(true);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
		}

		return editor;
	}, []);

	const applyFormat = useCallback(
		(action: ToolbarAction) => {
			const editor = focusEditor();
			if (!editor) {
				return;
			}

			switch (action) {
				case 'heading1':
					document.execCommand('formatBlock', false, 'H1');
					break;
				case 'heading2':
					document.execCommand('formatBlock', false, 'H2');
					break;
				case 'heading3':
					document.execCommand('formatBlock', false, 'H3');
					break;
				case 'bold':
					document.execCommand('bold');
					break;
				case 'italic':
					document.execCommand('italic');
					break;
				case 'underline':
					document.execCommand('underline');
					break;
				case 'bulletList':
					document.execCommand('insertUnorderedList');
					break;
				case 'checklist': {
					document.execCommand('insertUnorderedList');
					const list = getSelectedList();
					if (list instanceof HTMLUListElement) {
						decorateChecklist(list);
					}
					break;
				}
			}

			emitMarkdown();
		},
		[emitMarkdown, focusEditor],
	);

	const handleChecklistClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) {
				return;
			}

			const button = target.closest<HTMLButtonElement>('[data-annotation-task-toggle="true"]');
			if (!button || !editorRef.current?.contains(button)) {
				return;
			}

			event.preventDefault();
			setChecklistButtonState(button, button.dataset.checked !== 'true');
			emitMarkdown();
		},
		[emitMarkdown],
	);

	const palette = isDarkMode
		? {
				background: '#020617',
				border: '#334155',
				muted: '#94a3b8',
				text: '#f8fafc',
				toolbar: '#0f172a',
				toolbarHover: '#1e293b',
			}
		: {
				background: '#ffffff',
				border: '#e2e8f0',
				muted: '#64748b',
				text: '#0f172a',
				toolbar: '#f8fafc',
				toolbarHover: '#f1f5f9',
			};

	return (
		<div className="annotation-editor-shell">
			<style>{`
				html, body, #root { height: 100%; margin: 0; background: transparent; }
				* { box-sizing: border-box; }
				.annotation-editor-shell {
					display: flex;
					height: 100%;
					min-height: 0;
					flex-direction: column;
					overflow: hidden;
					border: 1px solid ${palette.border};
					border-radius: 18px;
					background: ${palette.background};
					color: ${palette.text};
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
				}
				.annotation-toolbar {
					display: flex;
					gap: 5px;
					min-height: 52px;
					align-items: center;
					overflow-x: auto;
					border-bottom: 1px solid ${palette.border};
					background: ${palette.toolbar};
					padding: 6px 8px;
					-webkit-overflow-scrolling: touch;
				}
				.annotation-toolbar button {
					min-width: 38px;
					height: 38px;
					flex: 0 0 auto;
					border: 0;
					border-radius: 12px;
					background: transparent;
					color: ${palette.text};
					font-size: 13px;
					font-weight: 700;
					cursor: pointer;
				}
				.annotation-toolbar button:hover, .annotation-toolbar button:focus-visible {
					background: ${palette.toolbarHover};
					outline: none;
				}
				.annotation-toolbar [data-action="italic"] { font-style: italic; font-family: Georgia, serif; }
				.annotation-toolbar [data-action="underline"] { text-decoration: underline; }
				.annotation-editor {
					min-height: 0;
					flex: 1;
					overflow-y: auto;
					padding: 16px;
					outline: none;
					color: ${palette.text};
					font-size: 16px;
					line-height: 1.55;
					white-space: pre-wrap;
					caret-color: ${palette.text};
				}
				.annotation-editor:empty::before { content: attr(data-placeholder); color: ${palette.muted}; pointer-events: none; }
				.annotation-editor p, .annotation-editor div { margin: 0 0 10px; }
				.annotation-editor h1, .annotation-editor h2, .annotation-editor h3 { color: ${palette.text}; line-height: 1.2; }
				.annotation-editor h1 { margin: 8px 0 12px; font-size: 1.75rem; }
				.annotation-editor h2 { margin: 8px 0 10px; font-size: 1.45rem; }
				.annotation-editor h3 { margin: 8px 0 8px; font-size: 1.2rem; }
				.annotation-editor ul, .annotation-editor ol { margin: 0 0 12px; padding-left: 24px; }
				.annotation-editor li { margin: 4px 0; }
				.annotation-editor ul[data-annotation-list="checklist"] { padding-left: 0; list-style: none; }
				.annotation-editor ul[data-annotation-list="checklist"] li { display: flex; align-items: flex-start; gap: 8px; }
				.annotation-task-toggle {
					width: 22px;
					height: 22px;
					flex: 0 0 22px;
					margin-top: 1px;
					border: 0;
					background: transparent;
					color: ${palette.text};
					font-size: 19px;
					line-height: 1;
					cursor: pointer;
				}
			`}</style>

			<div className="annotation-toolbar" aria-label="Ferramentas de formatação">
				{TOOLBAR_ITEMS.map((item) => (
					<button
						key={item.action}
						type="button"
						data-action={item.action}
						title={item.label}
						aria-label={item.label}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => applyFormat(item.action)}
					>
						{item.symbol}
					</button>
				))}
			</div>

			<div
				ref={editorRef}
				className="annotation-editor"
				contentEditable
				suppressContentEditableWarning
				role="textbox"
				aria-multiline="true"
				aria-label="Conteúdo da anotação"
				data-placeholder="Escreva o que quiser por aqui..."
				onInput={emitMarkdown}
				onClick={handleChecklistClick}
				onMouseDown={(event) => {
					if ((event.target as HTMLElement).closest?.('[data-annotation-task-toggle="true"]')) {
						event.preventDefault();
					}
				}}
			/>
		</div>
	);
}
