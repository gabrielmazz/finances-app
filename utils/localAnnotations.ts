import type { LocalAnnotation } from '@/types/localAnnotations';

export const getLocalAnnotationTitle = (annotation: Pick<LocalAnnotation, 'title'>) =>
	annotation.title.trim() || 'Sem título';

const getPlainPreviewLine = (line: string) =>
	line
		.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)/, '')
		.replace(/<\/?u>/gi, '')
		.replace(/[*_~`]/g, '')
		.trim();

export const getLocalAnnotationPreview = (annotation: Pick<LocalAnnotation, 'markdown'>) => {
	const firstMeaningfulLine = annotation.markdown.split('\n').map(getPlainPreviewLine).find(Boolean);

	return firstMeaningfulLine || 'Toque para começar a escrever';
};
