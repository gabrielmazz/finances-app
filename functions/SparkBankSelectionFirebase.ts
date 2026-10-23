import type { Firestore } from 'firebase/firestore';
import { readSparkAccountsFirebase } from './SparkAccountReadFirebase';

/** Seleção ativa é distinta do extrato histórico; o editor do catálogo não é o titular da conta. */
export async function readSparkBankSelectionFirebase(firestore: Firestore, actorId: string, groupId: string, includeInactive = false) {
  const accounts = await readSparkAccountsFirebase(firestore, actorId, groupId, { requireCurrent: false });
  return accounts.filter(account => account.position.kind === 'bank' && (includeInactive || account.position.active && !account.lifecycle.archived))
    .map(account => {
      if (!account.catalog) throw new Error('Conclua a reconciliação do cadastro bancário antes de selecionar a conta.');
      return { id: account.accountId, groupId, name: account.catalog.name, colorHex: account.catalog.colorHex, iconKey: account.catalog.iconKey,
        isActive: account.position.active, lifecycleActive: account.lifecycle.isActive, archived: account.lifecycle.archived, financialSource: 'spark' as const, catalogRevision: account.catalogRevision };
    }).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}
