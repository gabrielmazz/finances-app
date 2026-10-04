import { db, firebaseFunctions } from '@/FirebaseConfig';
import { collection, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';
import type { InvestmentAssetType, InvestmentValuationMethod } from '@/utils/investmentPortfolio';

type LegacyRequest = { expectedActorId: string; clientActionId?: string; assistantRequestFingerprint?: string; date: Date; description?: string | null };
export type LegacyFinancialMovementCommand = LegacyRequest & (
  | { kind: 'create_transfer'; sourceBankId: string; targetBankId: string; valueInCents: number }
  | { kind: 'create_cash_withdrawal'; bankId: string; valueInCents: number }
  | { kind: 'create_investment'; bankId: string; name: string; initialValueInCents: number; currentValueInCents?: number; cdiPercentageInBasisPoints: number; assetType?: InvestmentAssetType; valuationMethod?: InvestmentValuationMethod; redemptionTerm: string }
  | { kind: 'update_investment'; investmentId: string; expectedFingerprint: string; fields: { name?: string; initialValueInCents?: number; currentValueInCents?: number; cdiPercentageInBasisPoints?: number; assetType?: InvestmentAssetType; valuationMethod?: InvestmentValuationMethod; redemptionTerm?: string; bankId?: string; description?: string | null } }
  | { kind: 'undo_investment_redemption' | 'undo_investment_deposit'; movementId: string; expectedMovementFingerprint: string; expectedInvestmentFingerprint: string }
  | { kind: 'deposit_investment' | 'redeem_investment'; investmentId: string; valueInCents: number; expectedFingerprint: string; categoryId?: string }
);
export type LegacyFinancialMovementResult = { recordId: string; idempotent: boolean; cashRescueId?: string; transferId?: string; expenseId?: string; gainId?: string; investmentId?: string; currentValueInCents?: number };

export async function executeLegacyFinancialMovementFirebase(input: LegacyFinancialMovementCommand): Promise<LegacyFinancialMovementResult> {
  const clientActionId = input.clientActionId ?? 'form_' + doc(collection(db, 'assistantOperationReceipts')).id;
  const command = { ...input, date: input.date.toISOString(), clientActionId, assistantRequestFingerprint: input.assistantRequestFingerprint ?? createAssistantRecordFingerprint(input) };
  return (await httpsCallable<typeof command, LegacyFinancialMovementResult>(firebaseFunctions, 'executeLegacyFinancialMovement')(command)).data;
}
