import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { createTagReferenceSummary } from '../utils/categoryReferenceSummary';

/** [[Categorias e CDI Spark]]: contagem informa a tela; o marcador permanente continua sendo a autoridade na exclusão. */
export async function getSparkCategoryReferencesFirebase(firestore: Firestore, groupId: string, categoryId: string) {
  const [category, reference, operations, plans] = await Promise.all([
    getDoc(doc(firestore, 'tags', categoryId)), getDoc(doc(firestore, 'sparkCategoryReferences', categoryId)),
    getDocs(query(collection(firestore, 'financialGroups', groupId, 'sparkOperations'), where('categoryId', '==', categoryId))),
    getDocs(query(collection(firestore, 'financialGroups', groupId, 'sparkRecurringPlans'), where('categoryId', '==', categoryId))),
  ]);
  const data = category.data();
  if (!data || data.groupId !== groupId || data.historyKnown !== true) throw new Error('Conclua o inventário dos vínculos antigos antes de excluir esta categoria.');
  const counts = { expenses: 0, gains: 0, mandatoryExpenses: 0, mandatoryGains: 0 };
  for (const operation of operations.docs) {
    const event = operation.data();
    if (event.kind === 'income' || event.kind === 'movement_correction' && event.movementKind === 'income') counts.gains += 1;
    if (event.kind === 'expense' || event.kind === 'movement_correction' && event.movementKind === 'expense') counts.expenses += 1;
  }
  for (const plan of plans.docs) {
    if (plan.data().recurringType === 'expense') counts.mandatoryExpenses += 1;
    if (plan.data().recurringType === 'gain') counts.mandatoryGains += 1;
  }
  return { ...createTagReferenceSummary(counts), permanentHistory: reference.exists() };
}
