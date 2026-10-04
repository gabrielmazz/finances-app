import { createHash } from 'node:crypto';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { calculateLegacyBankBalanceInCents } from '../../utils/monthlyBalance';
import { createAssistantRecordFingerprint } from '../../utils/assistantRecordFingerprint';
import { assertClientActionId } from '../../utils/financialLedger';
import { endOfFinancialCivilDay } from '../../utils/financialCivilDate';
import { getInvestmentAssetType, getInvestmentValuationMethod } from '../../utils/investmentPortfolio';

type RecordData = Record<string, any>;
const actions = ['create_transfer', 'create_cash_withdrawal', 'create_investment', 'deposit_investment', 'redeem_investment', 'update_investment', 'undo_investment_redemption', 'undo_investment_deposit'] as const;
const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim() || (field.endsWith('Id') && value.includes('/'))) throw new HttpsError('invalid-argument', field + ' is invalid.');
  return value.trim();
};
const cents = (value: unknown, field: string, positive = true): number => {
  if (!Number.isSafeInteger(value) || (value as number) < (positive ? 1 : 0)) throw new HttpsError('invalid-argument', field + ' must be integer cents.');
  return value as number;
};
const denied = (reason: string, message: string): never => { throw new HttpsError('failed-precondition', message, { reason }); };
const documentId = (personId: string, actionId: string, suffix: string) => 'assistant_' + createHash('sha256').update(JSON.stringify({ personId, actionId, suffix })).digest('hex') + '_' + suffix;
const receiptId = (personId: string, actionId: string) => 'assistant_' + createAssistantRecordFingerprint({ personId, actionId, suffix: 'receipt' }) + '_receipt';
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
};

// [[Comandos Financeiros Conversacionais]]: query completa e trava do banco no mesmo commit.
export const executeLegacyFinancialMovement = onCall({ region: 'southamerica-east1' }, async request => {
  const personId = request.auth?.uid;
  if (!personId) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const data = request.data as RecordData;
  if (!data || data.expectedActorId !== personId) throw new HttpsError('unauthenticated', 'A sessão mudou.');
  if (!actions.includes(data.kind)) throw new HttpsError('invalid-argument', 'Invalid legacy movement action.');
  const clientActionId = text(data.clientActionId, 'clientActionId'); assertClientActionId(clientActionId);
  const assistantRequestFingerprint = text(data.assistantRequestFingerprint, 'assistantRequestFingerprint');
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex');
  const date = new Date(data.date);
  if (Number.isNaN(date.valueOf())) throw new HttpsError('invalid-argument', 'Invalid financial date.');
  if (data.description != null && typeof data.description !== 'string') throw new HttpsError('invalid-argument', 'Description must be text.');
  const description = data.description == null ? null : String(data.description).trim();
  if (description && description.length > 2000) throw new HttpsError('invalid-argument', 'Description is too long.');
  const kind = data.kind as typeof actions[number];
  const db = getFirestore();
  return db.runTransaction(async transaction => {
    const user = await transaction.get(db.doc('users/' + personId));
    if (!user.exists || user.data()?.financialGroupId || user.data()?.financialLegacyCutoverAt) throw new HttpsError('permission-denied', 'Use the ledger after financial cutover.');
    const allowedIds = new Set<string>([personId, ...(Array.isArray(user.data()?.relatedIdUsers) ? user.data()!.relatedIdUsers.filter((value: unknown) => typeof value === 'string') : [])]);
    const receiptRef = db.doc('assistantOperationReceipts/' + receiptId(personId, clientActionId));
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) {
      if (receipt.data()?.personId !== personId || receipt.data()?.serverFingerprint !== fingerprint) denied('idempotency-conflict', 'The request arguments changed.');
      return { ...receipt.data()?.result, idempotent: true };
    }
    const touchedBanks = new Set<string>();
    const bank = async (bankId: string): Promise<RecordData> => {
      const snapshot = await transaction.get(db.doc('banks/' + bankId));
      if (!snapshot.exists || !allowedIds.has(snapshot.data()!.personId)) throw new HttpsError('permission-denied', 'The bank is outside the authorized scope.');
      if (snapshot.data()?.isActive === false) denied('inactive-account', 'This bank is inactive.');
      if (snapshot.data()!.personId !== personId) {
        const owner = await transaction.get(db.doc('users/' + snapshot.data()!.personId));
        if (owner.data()?.financialGroupId || owner.data()?.financialLegacyCutoverAt) throw new HttpsError('permission-denied', 'This bank belongs to a migrated account.');
      }
      touchedBanks.add(bankId); return snapshot.data()!;
    };
    const sufficientBankBalance = async (bankId: string, amount: number, projection?: { investmentId?: string; investment?: RecordData; removedGainId?: string; removedExpenseId?: string; asOfDate?: Date; allowNegative?: boolean }): Promise<void> => {
      const load = async (collectionName: string) => {
        const records = await transaction.get(db.collection(collectionName).where('bankId', '==', bankId));
        return records.docs.filter(item => allowedIds.has(item.data().personId)).map(item => ({ id: item.id, ...item.data() }) as { id: string; bankId?: string; year?: number; month?: number; valueInCents?: number; differenceInCents?: number; date?: unknown; createdAt?: unknown; initialValueInCents?: number; initialInvestedInCents?: number });
      };
      const [snapshots, expenses, gains, cashRescues, investments, balanceAdjustments] = await Promise.all(['monthlyBalances', 'expenses', 'gains', 'cashRescues', 'financeInvestments', 'bankBalanceAdjustments'].map(load));
      const balance = calculateLegacyBankBalanceInCents({ bankId, snapshots, expenses: expenses.filter(item => item.id !== projection?.removedExpenseId), gains: gains.filter(item => item.id !== projection?.removedGainId), cashRescues, investments: projection?.investmentId ? [...investments.filter(item => item.id !== projection.investmentId), ...(projection.investment?.bankId === bankId ? [projection.investment] : [])] : investments, balanceAdjustments, asOfDate: endOfFinancialCivilDay(projection?.asOfDate ?? date), snapshotTimeZone: 'America/Sao_Paulo' });
      if (balance === null) denied('missing-monthly-balance', 'Register the opening balance first.');
      if (!Number.isSafeInteger(balance)) denied('amount-limit', 'The bank balance exceeds integer limits.');
      if (amount > balance! && !projection?.allowNegative) denied('insufficient-bank-balance', 'The available bank balance is insufficient.');
    };
    const createdAt = FieldValue.serverTimestamp(); const common = { personId, date: Timestamp.fromDate(date), assistantActionId: clientActionId, createdAt, updatedAt: createdAt };
    const writes: Array<() => void> = [];
    const write = (collectionName: string, suffix: string, fields: RecordData) => {
      const id = documentId(personId, clientActionId, suffix);
      writes.push(() => transaction.set(db.doc(collectionName + '/' + id), { ...common, ...fields })); return id;
    };
    let result: RecordData;
    if (kind === 'create_transfer') {
      const sourceBankId = text(data.sourceBankId, 'sourceBankId'); const targetBankId = text(data.targetBankId, 'targetBankId');
      if (sourceBankId === targetBankId) denied('same-bank', 'Choose different banks.');
      const source = await bank(sourceBankId); const target = await bank(targetBankId); const amount = cents(data.valueInCents, 'valueInCents');
      await sufficientBankBalance(sourceBankId, amount);
      const transferId = documentId(personId, clientActionId, 'transfer'); const expenseId = documentId(personId, clientActionId, 'transfer_out'); const gainId = documentId(personId, clientActionId, 'transfer_in');
      const note = description || 'Transferência de ' + source.name + ' para ' + target.name + '.';
      const linked = { valueInCents: amount, tagId: null, moneyFormat: false, isBankTransfer: true, bankTransferPairId: transferId, bankTransferSourceBankId: sourceBankId, bankTransferTargetBankId: targetBankId, bankTransferSourceBankNameSnapshot: source.name, bankTransferTargetBankNameSnapshot: target.name, bankTransferExpenseId: expenseId, bankTransferGainId: gainId, explanation: note };
      write('bankTransfers', 'transfer', { sourceBankId, targetBankId, valueInCents: amount, description: note, sourceBankNameSnapshot: source.name, targetBankNameSnapshot: target.name, expenseId, gainId });
      write('expenses', 'transfer_out', { ...linked, name: 'Transferência para ' + target.name, bankId: sourceBankId, bankTransferDirection: 'outgoing', isInvestmentDeposit: false, investmentId: null, investmentNameSnapshot: null });
      write('gains', 'transfer_in', { ...linked, name: 'Transferência recebida de ' + source.name, bankId: targetBankId, bankTransferDirection: 'incoming', paymentFormats: ['transferencia-bancaria'], isInvestmentRedemption: false, investmentId: null, investmentNameSnapshot: null });
      result = { recordId: transferId, transferId, expenseId, gainId, idempotent: false };
    } else if (kind === 'create_cash_withdrawal') {
      const bankId = text(data.bankId, 'bankId'); const source = await bank(bankId); const amount = cents(data.valueInCents, 'valueInCents');
      await sufficientBankBalance(bankId, amount);
      const id = write('cashRescues', 'cash_withdrawal', { name: 'Saque em dinheiro', bankId, bankNameSnapshot: source.name, valueInCents: amount, description });
      result = { recordId: id, cashRescueId: id, idempotent: false };
    } else if (kind === 'create_investment') {
      const bankId = text(data.bankId, 'bankId'); const source = await bank(bankId); const initial = cents(data.initialValueInCents, 'initialValueInCents', false);
      await sufficientBankBalance(bankId, initial);
      const current = data.currentValueInCents === undefined ? initial : cents(data.currentValueInCents, 'currentValueInCents', false);
      const percentage = cents(data.cdiPercentageInBasisPoints ?? 0, 'cdiPercentageInBasisPoints', false);
      if (percentage > 1_000_000) throw new HttpsError('invalid-argument', 'CDI percentage is outside the supported range.');
      if (data.assetType !== undefined && !['fixed_income', 'treasury', 'stock', 'fund'].includes(data.assetType) || data.valuationMethod !== undefined && !['manual', 'cdi'].includes(data.valuationMethod)) throw new HttpsError('invalid-argument', 'Investment metadata is invalid.');
      const assetType = getInvestmentAssetType(data.assetType); const valuationMethod = getInvestmentValuationMethod(data.valuationMethod, assetType);
      const id = write('financeInvestments', 'investment', { name: text(data.name, 'name'), initialValueInCents: initial, initialInvestedInCents: initial, currentValueInCents: current, cdiPercentage: percentage / 100, cdiPercentageInBasisPoints: percentage, assetType, valuationMethod, redemptionTerm: text(data.redemptionTerm, 'redemptionTerm'), bankId, bankNameSnapshot: source.name, description, lastManualSyncValueInCents: current, lastManualSyncAt: createdAt });
      result = { recordId: id, investmentId: id, currentValueInCents: current, idempotent: false };
    } else if (kind === 'update_investment') {
      const investmentId = text(data.investmentId, 'investmentId'); const reference = db.doc('financeInvestments/' + investmentId);
      const snapshot = await transaction.get(reference); const current = snapshot.data();
      if (!current || current.personId !== personId) throw new HttpsError('permission-denied', 'Only the investment owner may change it.');
      if (typeof data.expectedFingerprint !== 'string' || createAssistantRecordFingerprint(current) !== data.expectedFingerprint) denied('stale-record', 'The investment changed after the summary.');
      const fields = data.fields;
      const allowed = ['name', 'initialValueInCents', 'currentValueInCents', 'cdiPercentageInBasisPoints', 'assetType', 'valuationMethod', 'redemptionTerm', 'bankId', 'description'];
      if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !Object.keys(fields).length || Object.keys(fields).some(key => !allowed.includes(key))) throw new HttpsError('invalid-argument', 'Investment changes are invalid.');
      const updates: RecordData = { updatedAt: createdAt };
      for (const key of ['name', 'redemptionTerm']) if (fields[key] !== undefined) updates[key] = text(fields[key], key);
      if (fields.description !== undefined) {
        if (fields.description !== null && (typeof fields.description !== 'string' || fields.description.length > 2000)) throw new HttpsError('invalid-argument', 'Description is invalid.');
        updates.description = fields.description;
      }
      const oldInitial = cents(current.initialValueInCents ?? current.initialInvestedInCents ?? 0, 'initialValueInCents', false);
      const previous = cents(current.currentValueInCents ?? current.lastManualSyncValueInCents ?? oldInitial, 'currentValueInCents', false);
      if (fields.initialValueInCents !== undefined) {
        const initial = cents(fields.initialValueInCents, 'initialValueInCents', false);
        updates.initialValueInCents = initial; updates.initialInvestedInCents = initial;
        if (fields.currentValueInCents === undefined && previous === oldInitial) updates.currentValueInCents = initial;
      }
      if (fields.currentValueInCents !== undefined) updates.currentValueInCents = cents(fields.currentValueInCents, 'currentValueInCents', false);
      if (updates.currentValueInCents !== undefined) { updates.lastManualSyncValueInCents = updates.currentValueInCents; updates.lastManualSyncAt = createdAt; }
      if (fields.cdiPercentageInBasisPoints !== undefined) {
        const percentage = cents(fields.cdiPercentageInBasisPoints, 'cdiPercentageInBasisPoints', false);
        if (percentage > 1_000_000) throw new HttpsError('invalid-argument', 'CDI percentage is outside the supported range.');
        updates.cdiPercentageInBasisPoints = percentage; updates.cdiPercentage = percentage / 100;
      }
      if (fields.assetType !== undefined && !['fixed_income', 'treasury', 'stock', 'fund'].includes(fields.assetType) || fields.valuationMethod !== undefined && !['manual', 'cdi'].includes(fields.valuationMethod)) throw new HttpsError('invalid-argument', 'Investment metadata is invalid.');
      if (fields.assetType !== undefined) updates.assetType = getInvestmentAssetType(fields.assetType);
      if (fields.assetType !== undefined || fields.valuationMethod !== undefined) updates.valuationMethod = getInvestmentValuationMethod(fields.valuationMethod, getInvestmentAssetType(fields.assetType ?? current.assetType));
      const oldBankId = text(current.bankId, 'bankId'); const newBankId = fields.bankId === undefined ? oldBankId : text(fields.bankId, 'bankId');
      const target = await bank(newBankId); if (oldBankId !== newBankId) await bank(oldBankId);
      if (fields.bankId !== undefined) { updates.bankId = newBankId; updates.bankNameSnapshot = target.name; }
      if (fields.initialValueInCents !== undefined || oldBankId !== newBankId) {
        const projected = { ...current, ...updates }; const originalDate = current.date?.toDate?.() ?? current.createdAt?.toDate?.();
        if (!(originalDate instanceof Date) || Number.isNaN(originalDate.valueOf())) denied('invalid-reference', 'The original investment date is unavailable.');
        // Validate both the original civil period and the current available balance.
        for (const asOfDate of [originalDate as Date, new Date()]) await sufficientBankBalance(newBankId, 0, { investmentId, investment: projected, asOfDate, allowNegative: newBankId === oldBankId && (updates.initialValueInCents ?? oldInitial) <= oldInitial });
      }
      writes.push(() => transaction.update(reference, updates));
      result = { recordId: investmentId, investmentId, currentValueInCents: updates.currentValueInCents ?? previous, idempotent: false };
    } else if (kind === 'undo_investment_redemption' || kind === 'undo_investment_deposit') {
      const isRedemption = kind === 'undo_investment_redemption';
      const movementId = text(data.movementId, 'movementId'); const movementRef = db.doc((isRedemption ? 'gains/' : 'expenses/') + movementId); const movement = (await transaction.get(movementRef)).data();
      if (!movement || movement.personId !== personId) throw new HttpsError('permission-denied', 'Only the redemption owner may reverse it.');
      if (!(isRedemption ? movement.isInvestmentRedemption : movement.isInvestmentDeposit) || typeof movement.investmentId !== 'string') denied('invalid-reference', 'This record is not an investment redemption.');
      if (typeof data.expectedMovementFingerprint !== 'string' || createAssistantRecordFingerprint(movement) !== data.expectedMovementFingerprint) denied('stale-record', 'The redemption changed after the summary.');
      const investmentId = text(movement.investmentId, 'investmentId'); const reference = db.doc('financeInvestments/' + investmentId); const current = (await transaction.get(reference)).data();
      if (!current || current.personId !== personId) throw new HttpsError('permission-denied', 'Only the investment owner may change it.');
      if (typeof data.expectedInvestmentFingerprint !== 'string' || createAssistantRecordFingerprint(current) !== data.expectedInvestmentFingerprint) denied('stale-record', 'The investment changed after the summary.');
      const bankId = text(movement.bankId, 'bankId'); await bank(bankId);
      const amount = cents(movement.valueInCents, 'valueInCents'); const previous = cents(current.currentValueInCents ?? current.lastManualSyncValueInCents ?? current.initialValueInCents ?? current.initialInvestedInCents, 'currentValueInCents', false);
      if (!isRedemption && amount > previous) denied('insufficient-investment-balance', 'The deposited amount exceeds the remaining confirmed investment value.');
      const next = isRedemption ? previous + amount : previous - amount; if (!Number.isSafeInteger(next)) denied('amount-limit', 'The resulting investment value exceeds integer limits.');
      await sufficientBankBalance(bankId, 0, { ...(isRedemption ? { removedGainId: movementId } : { removedExpenseId: movementId, allowNegative: true }), asOfDate: new Date() });
      writes.push(() => transaction.update(reference, { currentValueInCents: next, lastManualSyncValueInCents: next, lastManualSyncAt: createdAt, updatedAt: createdAt }));
      writes.push(() => transaction.delete(movementRef));
      result = { recordId: movementId, investmentId, currentValueInCents: next, idempotent: false };
    } else {
      const investmentId = text(data.investmentId, 'investmentId'); const reference = db.doc('financeInvestments/' + investmentId); const investment = await transaction.get(reference);
      if (!investment.exists || investment.data()?.personId !== personId) throw new HttpsError('permission-denied', 'Only the investment owner may change it.');
      const current = investment.data()!;
      if (typeof data.expectedFingerprint !== 'string' || createAssistantRecordFingerprint(current) !== data.expectedFingerprint) denied('stale-record', 'The investment changed after the summary.');
      const bankId = text(current.bankId, 'bankId'); await bank(bankId); const amount = cents(data.valueInCents, 'valueInCents');
      const previous = current.currentValueInCents ?? current.lastManualSyncValueInCents ?? current.initialValueInCents ?? current.initialInvestedInCents;
      if (!Number.isSafeInteger(previous)) denied('amount-limit', 'The confirmed investment balance is invalid.');
      if (kind === 'deposit_investment') await sufficientBankBalance(bankId, amount);
      else if (amount > previous) denied('insufficient-investment-balance', 'The redemption exceeds the confirmed investment value.');
      const next = kind === 'deposit_investment' ? previous + amount : previous - amount;
      if (!Number.isSafeInteger(next)) denied('amount-limit', 'The resulting investment value exceeds integer limits.');
      const usage = kind === 'deposit_investment' ? 'expense' : 'gain';
      const categoryId = data.categoryId ? text(data.categoryId, 'categoryId') : documentId(personId, 'investment_tag', usage);
      const categoryRef = db.doc('tags/' + categoryId); const category = await transaction.get(categoryRef);
      if (category.exists) {
        if (!allowedIds.has(category.data()?.personId)) throw new HttpsError('permission-denied', 'Category is outside the authorized scope.');
        if (category.data()?.usageType && !['both', usage].includes(category.data()!.usageType)) denied('invalid-reference', 'Category does not accept this movement.');
      } else if (data.categoryId) denied('not-found', 'The category was removed.');
      else writes.push(() => transaction.set(categoryRef, { name: 'Investimento', personId, usageType: usage, isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false, iconFamily: 'material-community', iconName: 'cash-multiple', iconStyle: null, createdAt, updatedAt: createdAt }));
      writes.push(() => transaction.update(reference, { currentValueInCents: next, lastManualSyncValueInCents: next, lastManualSyncAt: createdAt, updatedAt: createdAt }));
      const suffix = kind === 'deposit_investment' ? 'investment_deposit' : 'investment_redemption';
      const movementId = write(usage === 'expense' ? 'expenses' : 'gains', suffix, { name: (usage === 'expense' ? 'Aporte - ' : 'Resgate - ') + current.name, valueInCents: amount, tagId: categoryId, bankId, explanation: description, moneyFormat: false, investmentId, investmentNameSnapshot: current.name, isBankTransfer: false, ...(usage === 'expense' ? { isInvestmentDeposit: true } : { isInvestmentRedemption: true, paymentFormats: ['transferencia-bancaria'] }) });
      result = { recordId: movementId, investmentId, currentValueInCents: next, idempotent: false };
    }
    for (const bankId of touchedBanks) transaction.update(db.doc('banks/' + bankId), { financialMovementRevision: FieldValue.increment(1) });
    writes.forEach(write => write());
    transaction.set(receiptRef, { personId, actorId: personId, kind, clientActionId, fingerprint: assistantRequestFingerprint, serverFingerprint: fingerprint, result, createdAt });
    transaction.set(db.doc('financialAuditEvents/legacy-' + personId + '-' + clientActionId), { actorId: personId, action: kind, clientActionId, recordId: result.recordId, createdAt });
    return result;
  });
});
