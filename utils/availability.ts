export const FEATURE_UNAVAILABLE_MESSAGE =
	'Recurso temporariamente indisponível. Você pode explorar as telas; consultas e alterações de dados estão desativadas.';

export function unavailableAction(): never {
	throw new Error(FEATURE_UNAVAILABLE_MESSAGE);
}
