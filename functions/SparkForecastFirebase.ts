import { doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { readSparkAccountsFirebase } from './SparkAccountReadFirebase';
import { readSparkFinancialEventsFirebase } from './SparkFinancialReadFirebase';
import { readSparkRecurringPlansFirebase } from './SparkRecurringReadFirebase';
import type { FinancialForecastPeriod } from '../utils/financialForecast';
import { projectSparkForecast } from '../utils/sparkFinancialForecast';

export async function readSparkForecastFirebase(firestore: Firestore, actorId: string, groupId: string, period: FinancialForecastPeriod, now = new Date()) {
  now = new Date(now);
  if (![3, 6, 12].includes(period)) throw new Error('Horizonte inválido.');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await readSparkAccountsFirebase(firestore, actorId, groupId);
    const [events, plans] = await Promise.all([readSparkFinancialEventsFirebase(firestore, actorId, groupId), readSparkRecurringPlansFirebase(firestore, actorId, groupId, now)]);
    const ids = [...new Set([...events.map(event => event.categoryId), ...plans.map(plan => plan.categoryId)].filter((id): id is string => !!id))];
    const categories = new Map<string, string>();
    for (let offset = 0; offset < ids.length; offset += 10) {
      const rows = await Promise.all(ids.slice(offset, offset + 10).map(async id => ({ id, data: (await getDocFromServer(doc(firestore, 'tags', id))).data() })));
      for (const { id, data } of rows) if (typeof data?.name === 'string' && (data.schemaVersion !== 1 || data.groupId === groupId)) categories.set(id, data.name);
    }
    const after = await readSparkAccountsFirebase(firestore, actorId, groupId);
    if (JSON.stringify(before) !== JSON.stringify(after)) continue;
    if ((await getSparkContextFirebase(firestore, actorId))?.groupId !== groupId) throw new Error('O acesso financeiro mudou.');
    return projectSparkForecast(after, events, plans, categories, now, period);
  }
  throw new Error('O financeiro mudou durante a previsão. Atualize a consulta.');
}
