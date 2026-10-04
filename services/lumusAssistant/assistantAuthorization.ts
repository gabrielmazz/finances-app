import type { AssistantDraftAction, AssistantExecutionAuthorization } from '@/types/lumusAssistant';
import { createAssistantId } from '@/utils/lumusAssistant';

type Grant = { uid: string; signature: string; active: () => boolean };
const grants = new WeakMap<AssistantExecutionAuthorization, Grant>();
const normalize = (text: string) => text.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.!]+$/g, '').trim();

export const isAssistantConfirmation = (text: string) => /^(?:sim(?:,? (?:confirmo|pode(?: fazer| registrar| executar| salvar| pagar| receber)?))?|confirmo(?: todas| o lote| este conjunto)?|pode(?: fazer| registrar| executar| salvar| pagar| receber)?|confirmar|registre|salve|execute)$/.test(normalize(text));
export const isAssistantCancellation = (text: string) => /^(?:cancela|cancelar|cancele|pare|parar|desiste|desistir)(?:\s+(?:isso|tudo|o lote|essa (?:despesa|receita|operacao)|esse pedido))?$/.test(normalize(text));
export const isAssistantDirectOrder = (text: string) => /^(?:registre|registrar|anote|adicione|crie|cadastrar|cadastre|salve|pague|receba|quitar)\b/.test(normalize(text)) && !/[?]/.test(text.split(/[;\n]/)[0] ?? text);
export const requiresAssistantConfirmation = (draft: AssistantDraftAction) => !['create_expense', 'create_gain', 'create_category', 'create_mandatory_expense', 'create_mandatory_gain', 'pay_mandatory_expense', 'receive_mandatory_gain'].includes(draft.kind);
export const canAssistantExecuteDirectly = (text: string, draft: AssistantDraftAction) => {
	if (!isAssistantDirectOrder(text) || requiresAssistantConfirmation(draft)) return false;
	const input = normalize(text.split(/[;\n]/)[0] ?? text);
	if (/\b(?:exemplo|simulacao|simule|hipotetic[oa])\b/.test(input)) return false;
	switch (draft.kind) {
		case 'create_expense': return !/^(?:registre|registrar|adicione|anote|crie|cadastre|salve)\s+(?:(?:uma?|[oa])\s+)?(?:despesa|gasto)\s+(?:recorrente|obrigatori[oa]|fix[oa]|parcelad[oa])\b/.test(input) && (/^(?:registre|registrar|adicione|anote|crie|cadastre|salve)\s+(?:(?:uma?|[oa])\s+)?(?:despesa|gasto)\b/.test(input) || /^(?:registre|registrar|adicione)\s+(?:r\$\s*[\d.,]+|[\d.,]+\s+reais?)\s+de\s+/.test(input));
		case 'create_gain': return /^(?:registre|registrar|adicione|anote|crie|cadastre|salve)\s+(?:(?:uma?|[oa])\s+)?(?:receita|ganho)\b/.test(input) && !/^(?:registre|registrar|adicione|anote|crie|cadastre|salve)\s+(?:(?:uma?|[oa])\s+)?(?:receita|ganho)\s+(?:recorrente|obrigatori[oa]|fix[oa]|parcelad[oa])\b/.test(input);
		case 'create_category': return /^(?:crie|cadastre|adicione|registre)\s+(?:(?:uma?|[oa])\s+)?(?:categoria|tag)\b/.test(input);
		case 'create_mandatory_expense': return /^(?:crie|cadastre|adicione|registre)\b/.test(input) && /\b(?:despesa|gasto|conta)\b/.test(input) && /\b(?:recorrente|recorrencia|obrigatori[oa]|fix[oa]|parcelad[oa])\b/.test(input);
		case 'create_mandatory_gain': return /^(?:crie|cadastre|adicione|registre)\b/.test(input) && /\b(?:receita|ganho)\b/.test(input) && /\b(?:recorrente|recorrencia|obrigatori[oa]|fix[oa]|parcelad[oa])\b/.test(input);
		case 'pay_mandatory_expense': return /^(?:pague|quitar|quite)\b/.test(input);
		case 'receive_mandatory_gain': return /^receba\b/.test(input);
		default: return false;
	}
};

// A assinatura cobre também o alvo revalidado e as dependências, não o texto do modelo.
export const assistantActionSignature = (draft: AssistantDraftAction) => JSON.stringify({
	 id: draft.clientActionId, kind: draft.kind, payload: draft.payload,
	 snapshot: draft.originalSnapshot, dependencies: draft.dependsOnActionIds,
});

export function createAssistantAuthorizationSession(uid: string) {
	let active = true;
	const events = new Map<string, string>();
	return {
		recordUserMessage(id: string, text: string) { if (active) events.set(id, text); },
		authorize(draft: AssistantDraftAction, messageId: string, mode: 'direct' | 'confirmation'): AssistantExecutionAuthorization | null {
			const text = events.get(messageId);
			if (!active || !text || (mode === 'confirmation' ? !isAssistantConfirmation(text) : !canAssistantExecuteDirectly(text,draft))) return null;
			const authorization = Object.freeze({ token: createAssistantId('authorization') });
			grants.set(authorization, { uid, signature: assistantActionSignature(draft), active: () => active });
			return authorization;
		},
		dispose() { active = false; events.clear(); },
	};
}

export function validateAssistantExecutionAuthorization(uid: string, draft: AssistantDraftAction, authorization?: AssistantExecutionAuthorization): boolean {
	const grant = authorization && grants.get(authorization);
	return Boolean(grant?.active() && grant.uid === uid && grant.signature === assistantActionSignature(draft));
}

export const isAssistantMutationIntent = (text: string) => {
	// Nomes citados são dados; uma ordem citada no início não vira autorização.
	const instructions = normalize(text).replace(/"[^"\n]*"|'[^'\n]*'|“[^”\n]*”|‘[^’\n]*’/g, '');
	return !/\b(?:nao|nunca)\b/.test(instructions) && /^(?:registre|registrar|anote|adicione|crie|cadastre|salve|pague|receba|quite|edite|altere|corrija|exclua|remova|transfira|resgate|ajuste|sincronize|estorne|invista|aporte|saque|gastei|recebi|comprei|paguei|quero (?:registrar|pagar|receber|criar|editar|alterar|excluir|transferir|resgatar|ajustar|investir|sacar))\b/.test(instructions);
};
