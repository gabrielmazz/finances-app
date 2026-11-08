export const FEATURE_UNAVAILABLE_MESSAGE =
	'Módulo financeiro temporariamente indisponível. Autenticação e perfil estão disponíveis no ambiente local; as operações financeiras serão reconstruídas nas próximas etapas.';

export function unavailableAction(): never {
	throw new Error(FEATURE_UNAVAILABLE_MESSAGE);
}
