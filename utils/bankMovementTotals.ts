import { shouldIncludeMovementInGainExpenseTotals } from './monthlyBalance';

type BankSummaryMovement = Parameters<typeof shouldIncludeMovementInGainExpenseTotals>[0] & {
  type: 'gain' | 'expense' | 'sync';
  valueInCents: number;
  sparkEconomicKind?: 'income' | 'expense' | null;
  sparkDeltaInCents?: number;
};

// [[Dashboard Home]]: estornos abatem a família econômica original, preservando a direção na timeline.
export function getBankMovementEconomicValue(movement: BankSummaryMovement) {
  if (!shouldIncludeMovementInGainExpenseTotals(movement)) return null;
  if (movement.isSparkMovement && movement.sparkEconomicKind) {
    if (!Number.isSafeInteger(movement.sparkDeltaInCents)) throw new Error('Movimentação sem valor econômico válido.');
    return { type: movement.sparkEconomicKind === 'income' ? 'gain' as const : 'expense' as const,
      valueInCents: movement.sparkEconomicKind === 'expense' ? -movement.sparkDeltaInCents! : movement.sparkDeltaInCents! };
  }
  if (movement.type === 'sync') return null;
  return { type: movement.type, valueInCents: movement.valueInCents };
}

export function computeBankMovementTotals(movements: BankSummaryMovement[]) {
  let gains = 0n, expenses = 0n;
  for (const movement of movements) {
    const economic = getBankMovementEconomicValue(movement);
    if (!economic) continue;
    if (!Number.isSafeInteger(economic.valueInCents)) throw new Error('Movimentação com centavos inválidos.');
    if (economic.type === 'gain') gains += BigInt(economic.valueInCents);
    else expenses += BigInt(economic.valueInCents);
  }
  const totalGains = Number(gains), totalExpenses = Number(expenses);
  if (!Number.isSafeInteger(totalGains) || !Number.isSafeInteger(totalExpenses)
    || !Number.isSafeInteger(Number(gains - expenses))) throw new Error('Totais do período excedem o limite de centavos.');
  return { totalGains, totalExpenses };
}
