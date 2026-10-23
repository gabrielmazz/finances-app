import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createSparkCivilMonthCalendar } from '../../../utils/sparkFinancialReconciliation';
import { SPARK_TRANSFER_PROOF_PROTOCOL } from '../../../functions/sparkFinancialProtocol';

export const SPARK_DEMO = {
  projectId: 'demo-lumus-financas', uid: 'spark-demo-user', groupId: 'spark-demo-group',
  email: 'spark@demo.lumus.local', password: 'Spark-teste-123!',
} as const;

/** [[Guia de Testes Locais]]: somente emuladores; nunca inicializa Admin antes desta verificação. */
export function assertSparkDemoEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.FIREBASE_PROJECT_ID !== SPARK_DEMO.projectId
    || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') {
    throw new Error('A demonstração exige o projeto demo-lumus-financas e os dois emuladores locais nas portas 8080/9099.');
  }
}

export async function seedSparkDemo() {
  assertSparkDemoEnvironment();
  const app = initializeApp({ projectId: SPARK_DEMO.projectId }, 'spark-local-seed');
  try {
    const firestore = getFirestore(app), auth = getAuth(app);
    // Não sobrescreve nem apaga uma sessão de testes já existente.
    if ((await firestore.collection('users').limit(1).get()).size
      || (await firestore.collection('financialGroups').limit(1).get()).size
      || (await firestore.collection('sparkOperationRecovery').limit(1).get()).size
      || (await firestore.collection('sparkOperationIntentQuotas').limit(1).get()).size
      || (await auth.listUsers(1)).users.length) throw new Error('O ambiente já contém dados. Encerre a sessão anterior e inicie uma nova demonstração.');
    await auth.createUser({ uid: SPARK_DEMO.uid, email: SPARK_DEMO.email, password: SPARK_DEMO.password,
      displayName: 'Pessoa de Teste Spark', emailVerified: true });
    const now = Timestamp.now(), calendar = createSparkCivilMonthCalendar(new Date().getFullYear() - 1, new Date().getFullYear() + 2);
    const month = calendar.find(row => row.startAt <= now.toDate() && row.endAt > now.toDate())!;
    const batch = firestore.batch(), group = firestore.doc(`financialGroups/${SPARK_DEMO.groupId}`);
    batch.create(group, { status: 'active', members: { [SPARK_DEMO.uid]: 'admin' }, sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL, localDemoVersion: 1 });
    batch.create(firestore.doc(`users/${SPARK_DEMO.uid}`), {
      name: 'Pessoa de Teste Spark', email: SPARK_DEMO.email, adminUser: true, relatedIdUsers: [],
      financialGroupId: SPARK_DEMO.groupId, financialGroupRole: 'admin', financialLegacyCutoverAt: now, createdAt: now,
    });
    for (const row of calendar) batch.create(firestore.doc(`sparkCivilMonths/${row.cycle}`), row);
    for (const account of [
      { id: 'demo-bank-main', kind: 'bank', name: 'Conta principal de teste', balance: 500000 },
      { id: 'demo-bank-reserve', kind: 'bank', name: 'Reserva de teste', balance: 200000 },
      { id: 'cash', kind: 'cash', name: 'Dinheiro', balance: 30000 },
    ]) {
      const operationId = `bootstrap_${account.id}`;
      batch.create(group.collection('sparkPositions').doc(account.id), { schemaVersion: 1, kind: account.kind, active: true,
        balanceInCents: account.balance, revision: 0, lastOperationId: operationId, nextActivationAt: null, updatedAt: now });
      batch.create(group.collection('sparkOperations').doc(operationId), { schemaVersion: 1, actorId: SPARK_DEMO.uid,
        kind: 'account_bootstrap', accountId: account.id, openingBalanceInCents: account.balance, createdAt: month.startAt });
      batch.create(group.collection('sparkAccountCatalog').doc(account.id), { schemaVersion: 1, actorId: SPARK_DEMO.uid,
        accountKind: account.kind, name: account.name, colorHex: null, iconKey: 'outro-banco', bankAccountId: null,
        assetType: null, valuationMethod: null, cdiPercentageInBasisPoints: null, redemptionTerm: null, description: null,
        revision: 0, lastOperationId: operationId, updatedAt: now });
    }
    for (const [id, name] of [['food', 'Alimentação'], ['home', 'Casa'], ['work', 'Trabalho']]) {
      batch.create(firestore.doc(`tags/demo-${id}`), {
        schemaVersion: 1, groupId: SPARK_DEMO.groupId, personId: SPARK_DEMO.uid, name, usageType: 'both',
        isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false,
        iconFamily: null, iconName: null, iconStyle: null, deleted: false, historyKnown: true,
        revision: 0, lastOperationId: `bootstrap_category_${id}`, createdAt: now, updatedAt: now,
      });
    }
    await batch.commit();
    console.log(`\nSpark local pronto. E-mail: ${SPARK_DEMO.email} | Senha: ${SPARK_DEMO.password}`);
    console.log('Dados fictícios: bancos R$ 5.000,00 e R$ 2.000,00; dinheiro R$ 300,00. Ao encerrar, estes dados são descartados.\n');
  } finally { await deleteApp(app); }
}
