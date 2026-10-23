import { sparkMetadataConfirmation, type SparkMetadataConfirmation } from './sparkMetadataConfirmation';

export type SparkMovementConfirmation = SparkMetadataConfirmation;

/** Confirmação participa do replay; não concede permissão nem substitui as Rules. */
export function sparkMovementConfirmation(input: SparkMovementConfirmation) {
  if (input.commandMaterial === undefined && input.expectedFingerprint === undefined && input.assistantRequestFingerprint === undefined) return {};
  return sparkMetadataConfirmation(input);
}
