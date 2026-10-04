import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LocalAnnotation } from '@/types/localAnnotations';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';

const STORAGE_KEY_PREFIX = '@lumus/local-annotations/v1';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isValidDate = (value: string) => Number.isFinite(Date.parse(value));

const sortByMostRecentlyUpdated = (annotations: LocalAnnotation[]) =>
	[...annotations].sort(
		(firstAnnotation, secondAnnotation) =>
			Date.parse(secondAnnotation.updatedAtISO) - Date.parse(firstAnnotation.updatedAtISO),
	);

const normalizeStoredAnnotation = (value: unknown): LocalAnnotation | null => {
	if (!isRecord(value)) {
		return null;
	}

	const { id, title, markdown, createdAtISO, updatedAtISO } = value;
	if (
		typeof id !== 'string' ||
		typeof title !== 'string' ||
		typeof markdown !== 'string' ||
		typeof createdAtISO !== 'string' ||
		typeof updatedAtISO !== 'string' ||
		!isValidDate(createdAtISO) ||
		!isValidDate(updatedAtISO)
	) {
		return null;
	}

	return { id, title, markdown, createdAtISO, updatedAtISO };
};

export const getLocalAnnotationsStorageKey = (userId: string) => `${STORAGE_KEY_PREFIX}/${encodeURIComponent(userId)}`;

export const loadLocalAnnotations = async (userId: string): Promise<LocalAnnotation[]> => {
	const rawValue = await AsyncStorage.getItem(getLocalAnnotationsStorageKey(userId));
	if (!rawValue) {
		return [];
	}

	try {
		const parsedValue = JSON.parse(rawValue);
		if (!Array.isArray(parsedValue)) {
			return [];
		}

		return sortByMostRecentlyUpdated(
			parsedValue.flatMap((item) => {
				const annotation = normalizeStoredAnnotation(item);
				return annotation ? [annotation] : [];
			}),
		);
	} catch {
		return [];
	}
};

const annotationMutations = new Map<string, Promise<void>>();

function serializeAnnotationMutation<T>(userId: string, operation: () => Promise<T>): Promise<T> {
	const previous = annotationMutations.get(userId) ?? Promise.resolve();
	const result = previous.then(operation);
	const finished = result.then(() => undefined, () => undefined);
	annotationMutations.set(userId, finished);
	void finished.then(() => { if (annotationMutations.get(userId) === finished) annotationMutations.delete(userId); });
	return result;
}

const writeAnnotations = async (userId: string, annotations: LocalAnnotation[]) => {
	await AsyncStorage.setItem(
		getLocalAnnotationsStorageKey(userId),
		JSON.stringify(sortByMostRecentlyUpdated(annotations)),
	);
};

/** Reposição integral para fixtures/importadores. Edição de um registro usa saveLocalAnnotation. */
export const saveLocalAnnotations = (userId: string, annotations: LocalAnnotation[]) =>
	serializeAnnotationMutation(userId, () => writeAnnotations(userId, annotations));

/** Read-modify-write compartilhado entre editor e conversa; um snapshot antigo não substitui a coleção. */
export const saveLocalAnnotation = (
	userId: string,
	annotation: LocalAnnotation,
	expectedFingerprint: string | null,
	isCurrent: () => boolean = () => true,
) => serializeAnnotationMutation(userId, async () => {
	const requireSession = () => { if (!isCurrent()) throw new Error('A conta mudou. Nenhuma gravação nova foi iniciada.'); };
	requireSession();
	const annotations = await loadLocalAnnotations(userId);
	requireSession();
	const existing = annotations.find(item => item.id === annotation.id);
	if (existing?.title === annotation.title && existing.markdown === annotation.markdown) return { annotations, annotation: existing, changed: false };
	if (expectedFingerprint === null && existing) throw new Error('Este pedido de anotação já foi usado com outro conteúdo. Envie um novo pedido.');
	if (expectedFingerprint !== null && (!existing || createAssistantRecordFingerprint(existing) !== expectedFingerprint)) throw new Error('A anotação mudou. Confira o texto e confirme novamente.');
	const next = sortByMostRecentlyUpdated([annotation, ...annotations.filter(item => item.id !== annotation.id)]);
	requireSession();
	await writeAnnotations(userId, next);
	return { annotations: next, annotation, changed: true };
});

export const createLocalAnnotation = (now = new Date()): LocalAnnotation => {
	const timestamp = now.toISOString();
	const suffix = Math.random().toString(36).slice(2, 10);

	return {
		id: `annotation-${now.getTime()}-${suffix}`,
		title: '',
		markdown: '',
		createdAtISO: timestamp,
		updatedAtISO: timestamp,
	};
};

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
