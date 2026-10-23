export type SparkMetadataConfirmation = { expectedFingerprint?: string | null; assistantRequestFingerprint?: string | null; commandMaterial?: string | null };
export function sparkMetadataConfirmation(input: SparkMetadataConfirmation) {
  const result = { expectedFingerprint: input.expectedFingerprint ?? null, assistantRequestFingerprint: input.assistantRequestFingerprint ?? null, commandMaterial: input.commandMaterial ?? null };
  for (const [key, value] of Object.entries(result)) if (value !== null && (typeof value !== 'string' || value.length > (key === 'commandMaterial' ? 16000 : 160))) throw new Error('Confirmação de metadados inválida.');
  return result;
}
