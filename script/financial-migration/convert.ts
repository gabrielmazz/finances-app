import { ACCOUNT_TYPES } from '../../domain/banks';
import { civilDay, validateMandatory } from '../../domain/mandatory';
import { toFinancialCivilDate } from '../../utils/financialCivilDate';
import { array, audit, b, boundedText, cents, flag, i, nil, optionalDate, requiredDate, Review, s, state, text, type Fields, type MigrationDocument } from './records';

export function bankFields(doc: MigrationDocument, actor: string): Fields {
  const name = boundedText(text(doc, 'name'), 100);
  const institutionKey = text(doc, 'institutionKey') ?? text(doc, 'bankIconKey') ?? 'outro-banco';
  const accountType = text(doc, 'accountType');
  const color = text(doc, 'colorHex');
  if (!/^[a-z0-9-]{1,64}$/.test(institutionKey) ||
      (accountType && !ACCOUNT_TYPES.some(type => type.value === accountType)) ||
      (color && !/^#[a-fA-F0-9]{6}$/.test(color))) throw Error('invalid-bank-metadata');
  if (['referenceAt', 'openingDate', 'initialBalanceCents'].some(field => doc.fields[field] && !('nullValue' in doc.fields[field])))
    throw new Review('legacy-reference-requires-reconciliation');
  return {
    ...audit(doc, actor), name: s(name), institutionKey: s(institutionKey),
    institutionName: s(boundedText(text(doc, 'institutionName') ?? name, 100)),
    accountType: s(accountType ?? 'unknown'), colorHex: color ? s(color) : nil,
    status: s(state(doc, 'archived') ? 'archived' : 'active'), revision: i(0),
  };
}

export function categoryFields(doc: MigrationDocument, actor: string): Fields {
  const name = boundedText(text(doc, 'name'), 100);
  const usage = text(doc, 'usageType');
  if ((usage !== undefined && !['gain', 'expense', 'both'].includes(usage)) ||
      (usage === 'expense' && flag(doc, 'isMandatoryGain')) || (usage === 'gain' && flag(doc, 'isMandatoryExpense')))
    throw new Review('incompatible-category-type');
  const fields: Fields = { ...audit(doc, actor), name: s(name), usageType: usage ? s(usage) : nil,
    status: s(state(doc, 'archived') ? 'archived' : 'active'), revision: i(0) };
  for (const key of ['isMandatoryGain', 'isMandatoryExpense', 'showInBothLists']) {
    if (doc.fields[key] && !('nullValue' in doc.fields[key]) && flag(doc, key) === undefined) throw Error('invalid-category-flag');
    fields[key] = b(flag(doc, key) ?? false);
  }
  for (const key of ['iconFamily', 'iconName', 'iconStyle']) {
    const value = text(doc, key);
    fields[key] = value === undefined ? nil : s(boundedText(value, 100, true));
  }
  return fields;
}

export function movementFields(doc: MigrationDocument, actor: string, accountId: string | null, type: 'gain' | 'expense'): Fields {
  const paymentState = ['isPaid', 'paid', 'isReceived', 'received', 'isPending', 'pending'];
  if (paymentState.some(key => doc.fields[key] && !('nullValue' in doc.fields[key]) && flag(doc, key) === undefined))
    throw Error('invalid-movement-payment-state');
  if (paymentState.some((key, index) => flag(doc, key) === (index >= 4))) throw new Review('unconfirmed-movement-payment-state');
  if (doc.fields.moneyFormat && !('nullValue' in doc.fields.moneyFormat) && flag(doc, 'moneyFormat') === undefined)
    throw Error('invalid-legacy-cash-format');
  const cash = flag(doc, 'moneyFormat') === true;
  if (cash && accountId !== null) throw new Review('cash-format-conflicts-with-bank-account');
  if (flag(doc, 'isBalanceAdjustment') || flag(doc, 'isReclaimedRecurring')) throw new Review('historical-adjustment-requires-review');
  const amount = cents(doc, 'valueInCents', 'amountCents');
  if (amount <= 0) throw Error('nonpositive-movement');
  const date = requiredDate(doc, 'date');
  const cancelledAt = optionalDate(doc, 'cancelledAt') ?? optionalDate(doc, 'deletedAt');
  const cancelledBy = text(doc, 'cancelledBy') ?? text(doc, 'deletedBy');
  const formats = doc.fields.paymentFormats?.arrayValue?.values ?? [];
  const mainFormats = formats.map(format => format.stringValue).filter((format): format is string => !!format && ['Variable', 'External'].includes(format));
  if (mainFormats.length > 1 || (type === 'expense' && mainFormats.length)) throw new Review('incompatible-payment-formats');
  const historicalFormats = doc.fields.paymentFormats;
  const historicalExplanation = text(doc, 'explanation') ?? text(doc, 'description') ?? '';
  const explanation = historicalExplanation.replace(/\r\n|[\r\n\t]/g, ' ');
  return {
    ...audit(doc, actor), accountId: accountId === null ? nil : s(accountId), type: s(type), amountCents: i(amount), date,
    name: s(boundedText(text(doc, 'name'), 100)),
    explanation: s(boundedText(explanation, 500, true)),
    ...(explanation !== historicalExplanation ? { historicalExplanation: s(historicalExplanation) } : {}),
    paymentFormats: array(mainFormats), ...(historicalFormats ? { historicalPaymentFormats: historicalFormats } : {}),
    status: s(state(doc, 'cancelled') ? 'cancelled' : 'posted'), revision: i(0), ...(cash ? { moneyFormat: b(true) } : {}),
    ...(cancelledAt ? { cancelledAt } : {}), ...(cancelledBy ? { cancelledBy: s(cancelledBy) } : {}),
  };
}

export function templateFields(doc: MigrationDocument, actor: string, categoryId: string, type: 'gain' | 'expense'): Fields {
  const count = doc.fields.installmentTotal?.integerValue;
  const total = doc.fields.installmentTotalValueInCents?.integerValue;
  if (doc.fields.installmentTotalValueInCents && !('nullValue' in doc.fields.installmentTotalValueInCents) && !total)
    throw Error('invalid-template-installment-total');
  const start = optionalDate(doc, 'installmentStartDate');
  const dueDay = doc.fields.dueDay?.integerValue;
  if (!dueDay || !/^\d+$/.test(dueDay) || (count && !/^\d+$/.test(count)) || (total && !/^\d+$/.test(total))) throw Error('invalid-template-schedule');
  const monthly = cents(doc, 'valueInCents');
  const installmentValue = total ? Number(total) : count ? Number(BigInt(count) * BigInt(monthly)) : null;
  const value = validateMandatory({
    type, categoryId, categorySource: 'new', name: boundedText(text(doc, 'name'), 100),
    description: boundedText(text(doc, 'description') ?? '', 500, true), valueInCents: monthly,
    dueDay: Number(dueDay), usesBusinessDays: flag(doc, 'usesBusinessDays') ?? false,
    installmentTotal: count ? Number(count) : null, installmentTotalValueInCents: installmentValue,
    installmentStartDate: start ? civilDay(toFinancialCivilDate(new Date(start.timestampValue!))) : null,
  });
  const completed = doc.fields.installmentsCompleted?.integerValue ?? '0';
  if (!/^\d+$/.test(completed) || Number(completed) > (value.installmentTotal ?? 0)) throw Error('invalid-template-completed-installments');
  const { updatedAt, updatedBy } = audit(doc, actor);
  return {
    updatedAt, updatedBy, name: s(value.name), description: s(value.description), valueInCents: i(value.valueInCents),
    dueDay: i(value.dueDay), type: s(type), categoryId: s(categoryId), categorySource: s('new'),
    usesBusinessDays: b(value.usesBusinessDays), isActive: b(!state(doc, 'archived')),
    installmentTotal: value.installmentTotal === null ? nil : i(value.installmentTotal),
    installmentTotalValueInCents: value.installmentTotalValueInCents === null ? nil : i(value.installmentTotalValueInCents),
    installmentStartDate: value.installmentStartDate ? { timestampValue: value.installmentStartDate + 'T00:00:00Z' } : nil,
    revision: i(0), installmentsCompleted: i(Number(completed)),
    lastCycle: nil, lastMovementDate: nil, lastAmountCents: nil, lastInstallments: i(0),
  };
}
