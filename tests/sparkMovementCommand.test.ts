const mockContext = jest.fn(), mockPost = jest.fn(), mockCorrect = jest.fn(), mockReverse = jest.fn();
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkMovementFirebase', () => ({ postSparkMovementFirebase: (...args: unknown[]) => mockPost(...args),
  correctSparkMovementFirebase: (...args: unknown[]) => mockCorrect(...args), reverseSparkMovementFirebase: (...args: unknown[]) => mockReverse(...args) }));
import { Timestamp, type Firestore } from 'firebase/firestore';
import { executeSparkMovementCommandFirebase, type SparkMovementCommand } from '@/functions/SparkMovementCommandFirebase';

const firestore = {} as Firestore;
const command = (): SparkMovementCommand => ({ groupId: 'group', actorId: 'owner', clientActionId: 'ordinary_command_123456', action: 'create', movementKind: 'expense',
  effectiveAt: new Timestamp(1700000000, 123456789), accountId: 'bank', amountInCents: 1200, categoryId: null,
  details: { name: 'Mercado', explanation: null, paymentFormats: ['Pix'], moneyFormat: false } });
beforeEach(() => { jest.clearAllMocks(); mockContext.mockResolvedValue({ groupId: 'group', actorId: 'owner', role: 'member' }); mockPost.mockResolvedValue({ transactionId: 'ordinary_command_123456', idempotent: false }); });

test('mesmo comando conserva centavos, descrição e precisão temporal na confirmação completa', async () => {
  const input = command(); await executeSparkMovementCommandFirebase(firestore, input);
  expect(mockPost).toHaveBeenCalledWith(firestore, expect.objectContaining({ kind: 'expense', amountInCents: 1200, expectedFingerprint: null }));
  const material = JSON.parse(mockPost.mock.calls[0][1].commandMaterial);
  expect(material).toMatchObject({ effectiveAt: { seconds: 1700000000, nanoseconds: 123456789 }, fields: { details: { name: 'Mercado', paymentFormats: ['Pix'] } } });
});

test('edição em andamento usa cópia dos campos e do alvo capturada antes da leitura do grupo', async () => {
  let resume!: (value: unknown) => void; mockContext.mockReturnValueOnce(new Promise(resolve => { resume = resolve; }));
  const input = { ...command(), action: 'correct', target: { source: 'imported', family: 'ordinary', operationId: 'imported_identity_123456' }, expectedFingerprint: 'confirmed' } as SparkMovementCommand;
  const result = executeSparkMovementCommandFirebase(firestore, input);
  if (input.action !== 'create') input.target.operationId = 'changed_123456';
  if (input.action !== 'reverse') { input.amountInCents = 999; input.details.paymentFormats.push('Outro'); }
  resume({ groupId: 'group' }); await result;
  expect(mockCorrect.mock.calls[0][1]).toMatchObject({ amountInCents: 1200, originalSource: 'imported', originalOperationId: 'imported_identity_123456', expectedFingerprint: 'confirmed', expectedMovementKind: 'expense', details: { paymentFormats: ['Pix'] } });
});

test('estorno conserva referência ordinária e intenção de confirmação sem escrever campos substitutos', async () => {
  const { groupId, actorId, clientActionId, effectiveAt } = command();
  await executeSparkMovementCommandFirebase(firestore, { groupId, actorId, clientActionId, effectiveAt, action: 'reverse', movementKind: 'income',
    target: { source: 'live', operationId: 'source_123456', family: 'ordinary' }, expectedFingerprint: 'old-record', assistantRequestFingerprint: 'proposal' });
  expect(mockReverse.mock.calls[0][1]).toMatchObject({ originalOperationId: 'source_123456', assistantRequestFingerprint: 'proposal' });
  expect(mockReverse.mock.calls[0][1]).not.toHaveProperty('amountInCents'); expect(mockPost).not.toHaveBeenCalled();
});

test.each([
  ['campos de recorrência', { recurringPlanId: 'rent' }], ['banco ausente', { accountId: null }], ['centavos fracionados', { amountInCents: 1.2 }],
  ['categoria indefinida', { categoryId: undefined }], ['data futura', { effectiveAt: Timestamp.fromMillis(Date.now() + 86400000) }],
  ['data sem Timestamp', { effectiveAt: new Date() }], ['confirmação longa', { assistantRequestFingerprint: 'x'.repeat(161) }],
  ['identidade de intenção ausente', { clientActionId: undefined }],
])('recusa %s antes de qualquer escrita ou consulta ao grupo', async (_label, fields) => {
  await expect(executeSparkMovementCommandFirebase(firestore, { ...command(), ...fields } as SparkMovementCommand)).rejects.toThrow();
  expect(mockContext).not.toHaveBeenCalled(); expect(mockPost).not.toHaveBeenCalled();
});

test.each([
  { target: { source: 'live', operationId: 'source_123456', family: 'pair' }, expectedFingerprint: 'old' },
  { target: { source: 'unknown', operationId: 'source_123456', family: 'ordinary' }, expectedFingerprint: 'old' },
  { target: { source: 'live', operationId: 'source_123456', family: 'ordinary', id: 'visual' }, expectedFingerprint: 'old' },
  { target: { source: 'live', operationId: 'source_123456', family: 'ordinary' }, expectedFingerprint: '' },
  { target: { source: 'live', operationId: undefined, family: 'ordinary' }, expectedFingerprint: 'old' },
])('resolução recusa alvo especial ou confirmação incompleta %#', async fields => {
  await expect(executeSparkMovementCommandFirebase(firestore, { ...command(), action: 'correct', ...fields } as SparkMovementCommand)).rejects.toThrow();
  expect(mockCorrect).not.toHaveBeenCalled(); expect(mockContext).not.toHaveBeenCalled();
});

test('grupo alterado, ausente ou falha de contexto nunca usa escritores anteriores', async () => {
  mockContext.mockResolvedValueOnce({ groupId: 'other' }).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('sessão mudou'));
  for (let index = 0; index < 3; index += 1) await expect(executeSparkMovementCommandFirebase(firestore, command())).rejects.toThrow();
  expect(mockPost).not.toHaveBeenCalled();
});
