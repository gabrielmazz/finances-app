import { getAuth } from 'firebase/auth';
import { collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter, where, type Firestore, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { getCycleKeyFromDate } from '../utils/mandatoryExpenses';
import { toFinancialCivilDate } from '../utils/financialCivilDate';
import { parseSparkRecurringReadModel, type SparkRecurringCycleReadModel } from '../utils/sparkRecurringReadModel';
import { getMandatoryInstallmentValueInCents, MAX_MANDATORY_INSTALLMENTS } from '../utils/mandatoryInstallments';

/** [[Integração Financeira Spark]]: planos, metadados e ciclos completos com revisão conferida ao final. */
export async function readSparkRecurringPlansFirebase(firestore: Firestore, actorId: string, groupId: string, asOfDate: Date) {
  const current = () => { if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.'); };
  if (!Number.isFinite(asOfDate.getTime())) throw new Error('Data de consulta inválida.');
  const context = await getSparkContextFirebase(firestore, actorId);
  if (context?.groupId !== groupId) throw new Error('Grupo Spark indisponível.');
  const civil = toFinancialCivilDate(asOfDate), first = getCycleKeyFromDate(civil);
  const last = [getCycleKeyFromDate(new Date(civil.getFullYear(), civil.getMonth() + 24, 1)), '2100-12'].sort()[0];
  const read = async (path: string[], filters: QueryConstraint[] = []) => {
    const rows: Array<{ id: string; data: Record<string, any> }> = []; let cursor: QueryDocumentSnapshot | undefined;
    do {
      current();
      const page = await getDocsFromServer(query(collection(firestore, 'financialGroups', groupId, path[0], ...path.slice(1)),
        ...filters, orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(200)));
      current(); rows.push(...page.docs.map(document => ({ id: document.id, data: document.data() })));
      if (page.size < 200) break; cursor = page.docs.at(-1);
    } while (cursor);
    return rows;
  };
  const signature = (rows: Array<{ id: string; data: Record<string, any> }>) => JSON.stringify(rows.map(row => [row.id, row.data.revision, row.data.lastOperationId]));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [plans, metadata] = await Promise.all([read(['sparkRecurringPlans']), read(['sparkRecurringMetadata'])]);
    const metadataById = new Map(metadata.map(row => [row.id, row.data]));
    const result: ReturnType<typeof parseSparkRecurringReadModel>[] = [];
    for (let offset = 0; offset < plans.length; offset += 10) result.push(...await Promise.all(plans.slice(offset, offset + 10).map(async row => {
      const cycles = await read(['sparkRecurringPlans', row.id, 'cycles'], [where(documentId(), '>=', first), where(documentId(), '<=', last)]);
      const cycleStates: SparkRecurringCycleReadModel[] = [];
      const activeCycles = cycles.flatMap(cycle => {
        const state = cycle.data, finite = row.data.installmentTotal !== null;
        const negotiated = state.settlementMode === 'negotiated';
        const late = finite && row.data.endCycle !== null && cycle.id > row.data.endCycle;
        const integer = (value: unknown, low: number, high = 1e12) => Number.isSafeInteger(value) && (value as number) >= low && (value as number) <= high;
        const id = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 160 && !value.includes('/');
        const date = state.effectiveAt instanceof Date ? state.effectiveAt : state.effectiveAt?.toDate?.();
        const amount = finite ? getMandatoryInstallmentValueInCents({ installmentTotal: row.data.installmentTotal,
          installmentsCompleted: state.installmentsBefore, installmentsToSettle: state.installmentsCount,
          installmentValueInCents: row.data.valueInCents, installmentTotalValueInCents: row.data.contractTotalInCents }) : state.amountInCents;
        if (state.schemaVersion !== 1 || typeof state.active !== 'boolean' || !integer(state.revision, 0)
          || !id(state.settlementOperationId) || !id(state.lastOperationId) || !id(state.accountId)
          || !integer(state.amountInCents, 1) || !integer(state.installmentsCount, 1, MAX_MANDATORY_INSTALLMENTS)
          || !integer(state.installmentsBefore, 0, finite ? row.data.installmentTotal : 0)
          || !integer(state.installmentsAfter, 0, finite ? row.data.installmentTotal : 0)
          || (late ? state.lateSettlement !== true : state.lateSettlement !== undefined)
          || (negotiated ? !finite || row.data.recurringType !== 'expense' || state.contractAmountInCents !== amount
            : state.settlementMode !== undefined || state.contractAmountInCents !== undefined || amount !== state.amountInCents)
          || (finite ? state.installmentsAfter !== state.installmentsBefore + state.installmentsCount : state.installmentsCount !== 1)
          || !(date instanceof Date) || !Number.isFinite(date.getTime()) || getCycleKeyFromDate(toFinancialCivilDate(date)) !== cycle.id) throw new Error('Estado do ciclo inválido.');
        cycleStates.push({ cycle: cycle.id, active: state.active, settlementOperationId: state.settlementOperationId, accountId: state.accountId,
          amountInCents: state.amountInCents, installmentsCount: state.installmentsCount, installmentsBefore: state.installmentsBefore,
          installmentsAfter: state.installmentsAfter, effectiveAt: date,
          ...(late ? { lateSettlement: true } : {}),
          ...(negotiated ? { settlementMode: 'negotiated', contractAmountInCents: state.contractAmountInCents } : {}) });
        return state.active ? [cycle.id] : [];
      });
      return { ...parseSparkRecurringReadModel(row.id, row.data, metadataById.get(row.id), activeCycles, { fromCycle: first, throughCycle: last },
        cycleStates.filter(cycle => cycle.lateSettlement).map(cycle => cycle.cycle)), cycleStates };
    })));
    const [afterPlans, afterMetadata] = await Promise.all([read(['sparkRecurringPlans']), read(['sparkRecurringMetadata'])]);
    if (signature(plans) !== signature(afterPlans) || signature(metadata) !== signature(afterMetadata)) continue;
    if ((await getSparkContextFirebase(firestore, actorId))?.groupId !== groupId) throw new Error('O acesso ao grupo financeiro mudou.');
    current(); return result;
  }
  throw new Error('As recorrências mudaram durante a consulta. Atualize a Home.');
}
