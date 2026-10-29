import { firebaseAuthStorage } from './firebaseAuthStorage';

const KEY = '@finances/registration-recovery-v1';
export type RegistrationRecovery = { uid: string; email: string; name: string | null; createdAt: string };

// [[Autenticação]]: UID e dados do perfil, nunca senha ou tokens, são locais e versionados.
async function readAll(): Promise<RegistrationRecovery[]> {
  const raw = await firebaseAuthStorage.getItem(KEY);
  if (raw === null) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Dados de recuperação do cadastro inválidos.'); }
  if (!Array.isArray(value) || value.length > 20 || value.some(item => !item || typeof item !== 'object'
    || Object.keys(item).some(key => !['uid', 'email', 'name', 'createdAt'].includes(key))
    || typeof item.uid !== 'string' || !item.uid || item.uid.length > 160 || item.uid.includes('/')
    || typeof item.email !== 'string' || !item.email || item.email !== item.email.trim().toLowerCase()
    || !(item.name === null || typeof item.name === 'string')
    || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)))) {
    throw new Error('Dados de recuperação do cadastro inválidos.');
  }
  const records = value as RegistrationRecovery[];
  if (new Set(records.map(item => item.email)).size !== records.length) throw new Error('Dados de recuperação duplicados.');
  return records;
}
let queue: Promise<void> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.then(() => undefined, () => undefined);
  return result;
}
export const registrationRecoveryStorage = {
  find(email: string) { return exclusive(async () => (await readAll()).find(item => item.email === email) ?? null); },
  save(entry: RegistrationRecovery) { return exclusive(async () => {
    const records = await readAll();
    const current = records.find(item => item.email === entry.email);
    if (current && (current.uid !== entry.uid || current.name !== entry.name || current.createdAt !== entry.createdAt)) throw new Error('Intenção de cadastro incompatível.');
    if (!current) records.push(entry);
    if (records.length > 20) throw new Error('Limite de cadastros pendentes atingido.');
    await firebaseAuthStorage.setItem(KEY, JSON.stringify(records));
  }); },
  remove(email: string, uid: string) { return exclusive(async () => {
    const records = await readAll();
    const current = records.find(item => item.email === email);
    if (current && current.uid !== uid) throw new Error('Intenção de cadastro incompatível.');
    const remaining = records.filter(item => item.email !== email);
    if (remaining.length) await firebaseAuthStorage.setItem(KEY, JSON.stringify(remaining));
    else await firebaseAuthStorage.removeItem(KEY);
  }); },
};
