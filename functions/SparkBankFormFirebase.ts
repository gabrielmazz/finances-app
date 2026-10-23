import { getAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { openSparkBankFirebase } from './SparkAccountFirebase';
import { readSparkAccountFirebase } from './SparkAccountReadFirebase';
import { saveSparkAccountCatalogFirebase } from './SparkAccountCatalogFirebase';
import { createOpaqueHandle } from '../utils/opaqueHandle';
import { validateSparkAccountCatalog, type SparkAccountCatalog } from '../utils/sparkAccountCatalog';
import { assertSparkBalance, sparkText } from './sparkFinancialProtocol';

export type SparkBankDraft = { actorId: string; bankId: string | null; name: string; colorHex: string | null; iconKey: string | null; openingBalanceInCents?: number; overdraftReason?: string | null };
export type SparkBankFormState = {
  loaded?: { actorId: string; groupId: string; bankId: string; revision: number | null };
  intent?: { key: string; actorId: string; groupId: string; accountId: string; clientActionId: string;
    revision: number | null; catalog: SparkAccountCatalog; openingBalanceInCents: number; overdraftReason: string | null; editing: boolean; status: 'prepared' | 'uncertain' | 'confirmed' };
};

export async function loadSparkBankFormFirebase(firestore: Firestore, state: SparkBankFormState, actorId: string, bankId: string) {
  if (state.intent?.status === 'uncertain') throw new Error('Confirme o envio anterior antes de recarregar o cadastro.');
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context) return null;
  const account = await readSparkAccountFirebase(firestore, actorId, context.groupId, bankId, { requireCurrent: false });
  if (account.position.kind !== 'bank' || !account.catalog) throw new Error('Banco sem cadastro disponível.');
  if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
  state.loaded = { actorId, groupId: context.groupId, bankId, revision: account.catalogRevision };
  return account.catalog;
}

/** [[Cadastros de Contas Spark]]: saldo inicial declarado na abertura; editar cadastro nunca altera dinheiro. */
export async function submitSparkBankFormFirebase(firestore: Firestore, state: SparkBankFormState, draft: SparkBankDraft, newId: () => string) {
  draft = { ...draft };
  const context = await getSparkContextFirebase(firestore, draft.actorId);
  if (!context) {
    if ((draft.openingBalanceInCents ?? 0) !== 0) throw new Error('Saldo inicial no cadastro exige o fluxo Spark. Use o saldo mensal no fluxo anterior.');
    if (state.loaded || state.intent) throw new Error('O contexto financeiro mudou. Reabra o cadastro.');
    return null;
  }
  if (context.role !== 'admin') throw new Error('O cadastro de bancos exige administrador do grupo.');
  const catalog = validateSparkAccountCatalog('bank', { name: draft.name, colorHex: draft.colorHex, iconKey: draft.iconKey,
    bankAccountId: null, assetType: null, valuationMethod: null, cdiPercentageInBasisPoints: null, redemptionTerm: null, description: null });
  const openingBalanceInCents = draft.openingBalanceInCents ?? 0;
  const overdraftReason = sparkText(draft.overdraftReason, 500);
  if (draft.bankId && (openingBalanceInCents !== 0 || overdraftReason)) throw new Error('Altere o saldo pelo fluxo de conferência, não pela edição do cadastro.');
  assertSparkBalance('bank', openingBalanceInCents, overdraftReason);
  const key = JSON.stringify({ actorId: draft.actorId, groupId: context.groupId, bankId: draft.bankId, catalog, openingBalanceInCents, overdraftReason });
  if (state.intent?.key !== key) {
    if (state.intent?.status === 'uncertain') throw new Error('O envio anterior precisa ser confirmado. Reenvie os mesmos dados antes de alterá-los.');
    const loaded = state.loaded;
    if (draft.bankId && (!loaded || loaded.actorId !== draft.actorId || loaded.groupId !== context.groupId || loaded.bankId !== draft.bankId)) throw new Error('Carregue o banco novamente antes de editar.');
    const clientActionId = newId();
    state.intent = { key, actorId: draft.actorId, groupId: context.groupId, clientActionId,
      accountId: draft.bankId ?? createOpaqueHandle('bank', context.groupId, clientActionId, draft.actorId),
      revision: loaded?.revision ?? null, catalog, openingBalanceInCents, overdraftReason, editing: !!draft.bankId, status: 'prepared' };
  }
  const intent = state.intent!;
  if (intent.status !== 'confirmed') {
    try {
      const identity = { groupId: intent.groupId, actorId: intent.actorId, clientActionId: intent.clientActionId };
      if (intent.editing) await saveSparkAccountCatalogFirebase(firestore, { ...identity, accountId: intent.accountId,
        accountKind: 'bank', expectedCatalogRevision: intent.revision, catalog: intent.catalog });
      else await openSparkBankFirebase(firestore, { ...identity, accountId: intent.accountId, openingBalanceInCents: intent.openingBalanceInCents, overdraftReason: intent.overdraftReason, catalog: intent.catalog });
      intent.status = 'confirmed';
      if (intent.editing) state.loaded = { actorId: intent.actorId, groupId: intent.groupId, bankId: intent.accountId, revision: (intent.revision ?? -1) + 1 };
    } catch (error) {
      if ((error as { sparkIntentCancelled?: boolean })?.sparkIntentCancelled) state.intent = undefined;
      else if (['unavailable', 'deadline-exceeded', 'unknown', 'aborted', 'permission-denied', 'unauthenticated'].includes((error as { code?: string })?.code ?? '')) intent.status = 'uncertain';
      throw error;
    }
  }
  if (getAuth(firestore.app).currentUser?.uid !== draft.actorId) throw new Error('A sessão autenticada mudou.');
  return { bankId: intent.accountId };
}
