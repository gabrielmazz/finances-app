import { sparkText } from '../functions/sparkFinancialProtocol';

export type SparkCategory = {
  name: string; usageType: 'expense' | 'gain' | 'both'; isMandatoryExpense: boolean; isMandatoryGain: boolean;
  showInBothLists: boolean; iconFamily: string | null; iconName: string | null; iconStyle: string | null;
};
export function sparkCategoryFromRecord(data: Record<string, unknown>): SparkCategory {
  if (data.usageType !== undefined && !['expense', 'gain', 'both'].includes(data.usageType as string)
    || ['isMandatoryExpense', 'isMandatoryGain', 'showInBothLists'].some(key => data[key] != null && typeof data[key] !== 'boolean')
    || ['iconFamily', 'iconName', 'iconStyle'].some(key => data[key] != null && typeof data[key] !== 'string')) throw new Error('Categoria inválida.');
  const usageType = data.usageType === 'expense' || data.usageType === 'gain' ? data.usageType : 'both';
  const showInBothLists = data.showInBothLists === true;
  return validateSparkCategory({ name: typeof data.name === 'string' ? data.name : '', usageType, showInBothLists,
    isMandatoryExpense: usageType !== 'gain' && (showInBothLists || data.isMandatoryExpense === true),
    isMandatoryGain: usageType !== 'expense' && (showInBothLists || data.isMandatoryGain === true),
    iconFamily: typeof data.iconFamily === 'string' ? data.iconFamily : null,
    iconName: typeof data.iconName === 'string' ? data.iconName : null, iconStyle: typeof data.iconStyle === 'string' ? data.iconStyle : null });
}
export function validateSparkCategory(value: SparkCategory): SparkCategory {
  const keys = ['name', 'usageType', 'isMandatoryExpense', 'isMandatoryGain', 'showInBothLists', 'iconFamily', 'iconName', 'iconStyle'];
  if (!value || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
    || !['expense', 'gain', 'both'].includes(value.usageType)
    || [value.isMandatoryExpense, value.isMandatoryGain, value.showInBothLists].some(flag => typeof flag !== 'boolean')
    || value.usageType === 'gain' && value.isMandatoryExpense || value.usageType === 'expense' && value.isMandatoryGain
    || value.showInBothLists && (value.usageType !== 'gain' && !value.isMandatoryExpense || value.usageType !== 'expense' && !value.isMandatoryGain)) throw new Error('Categoria inválida.');
  const name = sparkText(value.name, 160); if (!name) throw new Error('Informe o nome da categoria.');
  return { ...value, name, iconFamily: sparkText(value.iconFamily, 100), iconName: sparkText(value.iconName, 100), iconStyle: sparkText(value.iconStyle, 100) };
}
