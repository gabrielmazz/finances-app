export type SparkMovementDetails = { name: string; explanation: string | null; paymentFormats: string[]; moneyFormat: boolean };

/** [[Operações Ordinárias Spark]]: campos de apresentação não substituem conta, categoria ou valor do evento. */
export function validateSparkMovementDetails(value: SparkMovementDetails): SparkMovementDetails {
  const keys = ['name', 'explanation', 'paymentFormats', 'moneyFormat'];
  if (!value || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
    || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 160
    || !(value.explanation === null || typeof value.explanation === 'string' && value.explanation.length <= 2000)
    || typeof value.moneyFormat !== 'boolean' || !Array.isArray(value.paymentFormats) || value.paymentFormats.length > 8
    || value.paymentFormats.some(format => typeof format !== 'string' || !format.trim() || format.length > 120)) throw new Error('Detalhes do lançamento inválidos.');
  return { name: value.name.trim(), explanation: value.explanation, paymentFormats: [...value.paymentFormats], moneyFormat: value.moneyFormat };
}
