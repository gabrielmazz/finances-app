import type { InvestmentAssetType, InvestmentValuationMethod } from './investmentPortfolio';

export type SparkAccountKind = 'bank' | 'cash' | 'investment';
export type SparkAccountCatalog = {
  name: string; colorHex: string | null; iconKey: string | null;
  bankAccountId: string | null; assetType: InvestmentAssetType | null;
  valuationMethod: InvestmentValuationMethod | null; cdiPercentageInBasisPoints: number | null;
  redemptionTerm: string | null; description: string | null;
};

/** [[Cadastros de Contas Spark]]: descrição e projeção nunca atribuem saldo. */
export function validateSparkAccountCatalog(kind: SparkAccountKind, value: SparkAccountCatalog): SparkAccountCatalog {
  const keys = ['name', 'colorHex', 'iconKey', 'bankAccountId', 'assetType', 'valuationMethod', 'cdiPercentageInBasisPoints', 'redemptionTerm', 'description'];
  const text = (item: unknown, max: number) => item === null || typeof item === 'string' && item.length <= max;
  if (!['bank', 'cash', 'investment'].includes(kind) || !value || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key))
    || typeof value.name !== 'string' || value.name.trim() !== value.name || value.name.length < 1 || value.name.length > 160
    || !(value.colorHex === null || typeof value.colorHex === 'string' && /^#[0-9a-f]{6}$/i.test(value.colorHex))
    || !text(value.iconKey, 160) || !text(value.redemptionTerm, 300) || !text(value.description, 2000)) throw new Error('Cadastro da conta inválido.');
  if (kind === 'investment') {
    if (!(value.bankAccountId === null || typeof value.bankAccountId === 'string' && value.bankAccountId.length > 0
      && value.bankAccountId.length <= 160 && !value.bankAccountId.includes('/'))
      || !['fixed_income', 'treasury', 'stock', 'fund'].includes(value.assetType as string)
      || !['cdi', 'manual'].includes(value.valuationMethod as string)
      || value.valuationMethod === 'cdi' && value.assetType !== 'fixed_income'
      || !Number.isSafeInteger(value.cdiPercentageInBasisPoints) || value.cdiPercentageInBasisPoints! < 0
      || value.cdiPercentageInBasisPoints! > 1_000_000) throw new Error('Configuração do investimento inválida.');
  } else if ([value.bankAccountId, value.assetType, value.valuationMethod, value.cdiPercentageInBasisPoints, value.redemptionTerm, value.description].some(item => item !== null)) {
    throw new Error('Campos de investimento não se aplicam a esta conta.');
  }
  return { ...value };
}
