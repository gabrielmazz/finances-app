import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') {
  throw new Error('Este seed de segurança só pode executar nos emuladores locais.');
}
const projectId = 'demo-lumus-financas';
initializeApp({ projectId });
const db = getFirestore();
async function run() {
  const users: Array<{ uid: string; label: string; email: string; token: string }> = [];
  for (const label of ['A', 'B']) {
    const email = `security-${label.toLowerCase()}@example.test`;
    const body = JSON.stringify({ email, password: 'Lumus-local-test-123!', returnSecureToken: true });
    let response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!response.ok) response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const result = await response.json() as { localId?: string; idToken?: string };
    if (!response.ok || !result.localId || !result.idToken) throw new Error('Falha ao criar conta sintética local.');
    users.push({ uid: result.localId, label, email, token: result.idToken });
  }
  if (process.argv.includes('--revoke')) {
    const invoke = async (data: object) => {
      const response = await fetch(`http://127.0.0.1:5001/${projectId}/southamerica-east1/userRelationship`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${users[1].token}` },
        body: JSON.stringify({ data }),
      });
      const body = await response.json() as { result?: { fingerprint: string; status: string } };
      if (!response.ok || !body.result) throw new Error('Falha na revogação local.');
      return body.result;
    };
    const preview = await invoke({ action: 'preview', relatedUserId: users[0].uid });
    const result = await invoke({ action: 'unlink', relatedUserId: users[0].uid,
      expectedFingerprint: preview.fingerprint, clientActionId: `browser_revoke_${Date.now()}` });
    if (result.status !== 'unlinked') throw new Error('Vínculo não revogado.');
    console.log('Vínculo sintético revogado pela callable autenticada de B.');
    return;
  }
  for (const user of users) {
    const batch = db.batch();
    const common = { personId: user.uid, createdAt: new Date(), updatedAt: new Date() };
    batch.set(db.doc(`users/${user.uid}`), { name: `Validação ${user.label}`, email: user.email, relatedIdUsers: users.filter(other => other.uid !== user.uid).map(other => other.uid), adminUser: false, createdAt: new Date() });
    for (const other of users.filter(other => other.uid !== user.uid)) {
      batch.delete(db.doc(`userRelationshipGrants/${user.uid}/related/${other.uid}`));
      batch.delete(db.doc(`userRelationshipInvites/${user.uid}/incoming/${other.uid}`));
    }
    batch.set(db.doc(`banks/security-${user.label}`), { ...common, name: `Banco ${user.label}`, isActive: true });
    batch.set(db.doc(`monthlyBalances/security-${user.label}`), { ...common, bankId: `security-${user.label}`, year: 2026, month: 10, valueInCents: user.label === 'A' ? 10000 : 20000 });
    batch.set(db.doc(`expenses/security-${user.label}`), { ...common, name: `Somente conta ${user.label}`, bankId: `security-${user.label}`, valueInCents: 100, date: new Date('2026-10-10T15:00:00Z'), isBankTransfer: false, isInvestmentDeposit: false });
    await batch.commit();
  }
  console.log(JSON.stringify({ environment: 'local-emulator', users: users.map(({ token: _token, ...user }) => user) }, null, 2));
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
