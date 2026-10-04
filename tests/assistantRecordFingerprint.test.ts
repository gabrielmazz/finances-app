import { Timestamp } from 'firebase/firestore';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';

describe('Material record fingerprint', () => {
  it('preserves names and integer cents without interpreting them as local dates', () => {
    expect(createAssistantRecordFingerprint({ name: 'Banco 1' })).not.toBe(createAssistantRecordFingerprint({ name: new Date('2001-01-01T00:00:00Z') }));
    expect(createAssistantRecordFingerprint({ amount: 1000 })).not.toBe(createAssistantRecordFingerprint({ amount: new Date(1000) }));
    expect(createAssistantRecordFingerprint({ civilDate: '2026-10-03' })).not.toBe(createAssistantRecordFingerprint({ civilDate: new Date('2026-10-03') }));
  });
  it('compares actual Date and Firestore Timestamp values independently of object order', () => {
    const date = new Date('2026-10-03T15:00:00Z');
    expect(createAssistantRecordFingerprint({ name: 'Banco 1', date })).toBe(createAssistantRecordFingerprint({ date: Timestamp.fromDate(date), name: 'Banco 1' }));
    expect(createAssistantRecordFingerprint({ amount: 1000 })).not.toBe(createAssistantRecordFingerprint({ amount: 1001 }));
  });
});
