---
tags: [firebase, configuracao, firestore, auth, app-check, ai-logic, remote-config, web, hosting, arquitetura]
relacionado: [[Autenticação]], [[Assistente Lumus]], [[Gerenciamento de Usuários]], [[Segurança de Login]], [[Versão Web]], [[Notificações]]
status: ativo
tipo: arquitetura
versao: 1.4.1
---

# Firebase Config

Configuração e inicialização do Firebase no projeto. Usa dois apps Firebase distintos e resolve o adaptador de persistência pela plataforma, sem alterar o modelo Firestore, as regras financeiras ou o fluxo de criação de usuários.

## Como funciona

```mermaid
graph TD
    FC[FirebaseConfig.ts / FirebaseConfig.web.ts] --> PA[App Primário]
    FC --> SA["App Secundário (SECONDARY)"]
    PA --> AUTH["auth (memory-only)"]
    PA --> DB["db (Firestore)"]
    SA --> SAUTH["secondaryAuth (SecureStore nativo / memória Web)"]
    AUTH --> AC[AuthContext]
DB --> FN["functions/*.ts"]
DB --> CF["backend/ (callable Functions do razão)"]
    SAUTH --> RU[RegisterUserFirebase]
```

### App Primário
- Inicializado em `FirebaseConfig.ts` (Android/iOS) ou `FirebaseConfig.web.ts` (navegador) com `initializeApp(firebaseConfig)`
- Expõe: `app`, `auth` (Firebase Auth) e `db` (Firestore)
- **Persistência memory-only**: no nativo, `memoryOnlyAuthStorage`; no navegador, `inMemoryPersistence` do SDK Firebase — ao fechar o app, a aba ou ao recarregar, a sessão é encerrada
- Isso é intencional: o usuário volta para a tela de login a cada abertura do app
- Usado para autenticação da sessão atual e todas as operações Firestore

### App Secundário
- Inicializado com `initializeApp(firebaseConfig, 'SECONDARY')`
- Expõe: `secondaryApp` e `secondaryAuth`
- No Android/iOS, usa `firebaseAuthStorage.ts` — SecureStore com fallback AsyncStorage — para as credenciais temporárias do fluxo de cadastro
- No navegador, `FirebaseConfig.web.ts` usa `inMemoryPersistence` também para o secundário; nenhuma conta criada deixa sessão em Local Storage, IndexedDB ou cookie
- Usado exclusivamente em `RegisterUserFirebase.ts` para criar novas contas sem afetar a sessão ativa
- Após criar o usuário, o app secundário é deslogado

### Estratégia de Persistência

| Plataforma | App | Persistência | Motivo |
|---|---|---|---|
| Android/iOS | Primário (`auth`) | Memory-only (sem storage) | Sessão encerra ao fechar o app |
| Android/iOS | Secundário (`secondaryAuth`) | SecureStore + AsyncStorage fallback | Mantém credenciais temporárias durante criação de conta |
| Web | Primário (`auth`) | `inMemoryPersistence` | Sessão encerra ao recarregar/fechar a aba ou navegador |
| Web | Secundário (`secondaryAuth`) | `inMemoryPersistence` | O cadastro não persiste credenciais secundárias no navegador |

### Alvos isolados

`utils/firebaseRuntime.ts` é o único resolvedor de ambiente. `EXPO_PUBLIC_FIREBASE_TARGET=emulator` cria uma configuração sintética para `demo-lumus-financas`, conecta Auth (primário e secundário), Firestore e Functions em `127.0.0.1` nas portas 9099, 8080 e 5001. Nenhuma credencial de produção é lida nesse modo.

`development` só aceita `emulator`. Os perfis instaláveis `preview`, `production` e `production-apk` só aceitam `production`, com o project ID `finances-app-e8685` e todas as credenciais; assim, um APK de preview não aponta para `127.0.0.1` no próprio aparelho. O preview usa App Check `debug`, enquanto produção e `production-apk` usam Play Integrity. Combinações inválidas falham antes de inicializar o SDK. O alias padrão da CLI continua sendo o demo project; deploys devem informar `--project production`.

O snapshot de ambiente usado no cliente acessa cada `process.env.EXPO_PUBLIC_*` diretamente antes de chamar o resolvedor. Esse formato é obrigatório para o Metro incorporar os valores no bundle. Uma release local sem `TARGET` explícito usa produção somente quando todas as credenciais obrigatórias existem e o project ID é o canônico; Metro em desenvolvimento continua escolhendo o Emulator. Não voltar a passar `process.env` inteiro ou a ler essas chaves apenas por índice dinâmico, pois o bundle instalado ficaria sem configuração e falharia antes de substituir a splash nativa.

### Variáveis de Ambiente
```
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_APP_ENV
EXPO_PUBLIC_FIREBASE_TARGET
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY
EXPO_PUBLIC_FIREBASE_APP_CHECK_ANDROID_PROVIDER
EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN
```

As credenciais de produção são validadas pelo resolvedor antes da inicialização do SDK. O modo Emulator usa somente a configuração sintética e o host local.

## Exports

```typescript
export const app: FirebaseApp;           // App primário
export const auth: Auth;                 // Auth memory-only
export const db: Firestore;              // Firestore principal
export const secondaryApp: FirebaseApp;  // App secundário
export const secondaryAuth: Auth;        // Auth secundário (SecureStore nativo / memória Web)
export const firebaseFunctions: Functions; // Functions já conectado ao alvo resolvido
```

## Arquivos principais

- backend/src/index.ts — Callable Functions confiáveis do razão financeiro
- firebase.json, firestore.rules e firestore.indexes.json — Configuração versionada do Firebase
- functions/FinancialLedgerFirebase.ts — Adaptador client para grupos já cortados


- `FirebaseConfig.ts` — Inicialização e exports Android/iOS
- `FirebaseConfig.web.ts` — Inicialização Web com Auth em memória para os dois apps
- `utils/firebaseAuthStorage.ts` — Persistência dual SecureStore/AsyncStorage (usado pelo app secundário)
- `firebase.json` e `.firebaserc` — Configuração do Firebase Hosting e projeto padrão `finances-app-e8685`
- `types/firebase-auth.d.ts` — Type declarations Firebase

## Integrações

- Grupos financeiros cortados usam backend/ como única camada de escrita para contas, razão, reconciliações e auditoria.


- [[Autenticação]] — Consome `auth` para `onAuthStateChanged` e `signInWithEmailAndPassword`; o `reload()` de validação não roda em listener de token para não criar loop de renovação
- [[Gerenciamento de Usuários]] — Consome `secondaryApp`/`secondaryAuth` para criar usuários
- Todos os `functions/*.ts` — Consomem `db` (Firestore) para operações CRUD
- [[Segurança de Login]] — `firebaseAuthStorage` configura persistência do `secondaryAuth`
- [[Assistente Lumus]] — Usa Firebase AI Logic, App Check e Remote Config, sem Cloud Functions

## Firebase AI Logic

- Web usa `firebase/ai`, o app primário JS autenticado e `ReCaptchaEnterpriseProvider`.
- Android usa módulos `@react-native-firebase` 25.1 alinhados para `app`, `app-check`, `ai`, `auth` e `remote-config`.
- O Auth/Firestore financeiro continua no SDK JS. O adaptador Android fornece ao SDK nativo da IA somente `getIdToken()` do usuário atual.
- App Check Android usa provider `debug` em development/preview e Play Integrity em produção.
- Enforcement deve ser ativado para Firebase AI Logic. Não ativar para Firestore nesta etapa porque o cliente Android financeiro continua no SDK JS.
- Antes de liberar a disponibilidade do Lumus IA no Android, o adaptador inicializa o App Check e solicita um token string não vazio. Falha nesse preflight deixa somente o assistente indisponível como erro de App Check/configuração; não invalida nem pede novo login para a sessão financeira do Firebase JS. `refreshAvailability()` força nova resolução de Remote Config e repete o preflight sob ação explícita do usuário.
- Remote Config controla kill switch, modelo e limites descritos em [[Assistente Lumus]]. Falha de fetch usa padrões locais limitados.
- A site key `EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY` é pública e serve somente ao reCAPTCHA Enterprise; não é chave Gemini.
- Não existe Cloud Function nem processo permanente: o aplicativo chama o serviço somente sob ação do usuário.

## Web e Firebase Hosting

- `app.json` declara `web.output: "single"` e `userInterfaceStyle: "automatic"`. O export `npx expo export --platform web` gera os artefatos estáticos em `dist/`.
- `firebase.json` preserva Functions, Firestore e emuladores existentes e acrescenta Hosting com `public: "dist"`, URLs limpas e rewrite de qualquer rota para `/index.html`. Isso permite que o Expo Router e `Stack.Protected` recebam deep links, sem criar Expo API Routes ou backend novo.
- `.firebaserc` aponta o CLI para `finances-app-e8685`. Os comandos do projeto são `npm run web:export`, `npm run web:serve`, `npm run web:deploy:preview` e `npm run web:deploy`; o último altera o Hosting remoto e deve ocorrer somente depois da revisão do preview.
- Configuração manual no Firebase Console, antes do primeiro deploy: adicionar `finances-app-e8685.web.app`, `finances-app-e8685.firebaseapp.com` e todo domínio próprio futuro à lista de domínios autorizados do Firebase Authentication. Registrar esses mesmos hosts no provider reCAPTCHA Enterprise do App Check para que o [[Assistente Lumus]] Web funcione em HTTPS.
- A chave `EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY` continua sendo pública por definição de cliente. Não incluir chave Gemini, segredo de servidor ou credencial administrativa no bundle Web.

## Configuração Expo nativa

- `app.config.ts` preserva a base de `app.json` e mantém somente as decisões dinâmicas: configura `expo-audio` e resolve o arquivo Android do Firebase. O próprio plugin de áudio materializa `RECORD_AUDIO` e `MODIFY_AUDIO_SETTINGS`; `expo-asset` é dependência peer direta, não plugin de configuração.
- `android.googleServicesFile` usa `GOOGLE_SERVICES_JSON` quando fornecido pelo EAS ou `./google-services.json` local. `@react-native-firebase/app` entra na lista de plugins somente quando um desses caminhos existe. Os perfis EAS Android `preview`, `production` e `production-apk` recusam o build sem o arquivo, pois todos apontam para produção e precisam conter Firebase AI/App Check/Remote Config. O perfil `development` permanece isolado no Emulator, onde o Lumus IA é indisponível, e não exige o arquivo nativo.
- `google-services.json` e `GoogleService-Info.plist` ficam no `.gitignore`.
- Esta entrega nativa do assistente é Android. `app.config.ts` não habilita o plugin durante `EAS_BUILD_PLATFORM=ios`; um futuro build iOS com React Native Firebase também deverá fornecer `ios.googleServicesFile` antes de remover essa proteção.
- Qualquer alteração de `expo-audio` ou React Native Firebase requer novo development build; Expo Go não suporta o adaptador Android.
- Provider e tela do assistente montam diretamente para não bloquear a entrada em `/lumus-assistant`. Somente os módulos React Native Firebase continuam com importação tardia, depois da checagem de runtime; Expo Go ou configuração Firebase ausente exibem indisponibilidade dentro do painel da tela. A boundary local recupera erro inesperado sem derrubar o Stack, Login ou Home.

## Configuração

### Razão financeiro e implantação

- As Functions são postMovement, transferFunds, reconcileAccount, reverseTransaction, manageAccount e migrateFinancialGroup.
- As regras negam escrita client-side em contas, razão, reconciliações e auditoria. A leitura é limitada aos membros do grupo ativo.
- As coleções legadas usadas pela Home (`tags`, `mandatoryExpenses`, `mandatoryGains` e `financeInvestmentSyncs`) têm regras explícitas de leitura por `personId` para o usuário e seus relacionados; escritas continuam limitadas ao dono do documento e exigem centavos inteiros quando aplicável.
- A migração dry-run não escreve. A execução exige a impressão digital aprovada, é reiniciável por cursor e não altera documentos legados.
- Antes de qualquer preview/produção: exportar Firestore, versionar as regras hoje implantadas, rodar o Emulator e migrar uma cópia de dados. Não fazer deploy cego destas regras sobre o projeto ativo.


- Variáveis via `EXPO_PUBLIC_*` (acessíveis no bundle client-side)
- `firebase` versão exata 12.16.0 (modular SDK); módulos React Native Firebase na versão exata 25.1.0
- O perfil EAS `development` usa somente o Emulator e deve ser aberto pelo script local, que inicia/semeia a Suite e aplica `adb reverse`. O `preview` herda as credenciais públicas de `production`, usa o ambiente EAS `preview`, exige `GOOGLE_SERVICES_JSON` nesse ambiente e gera APK com App Check `debug`. `production-apk` estende `production`, usa o ambiente EAS `production` e gera um APK interno com Play Integrity para validar a mesma configuração do AAB destinado à Play Store.
- Projeto EAS: `faae4c50-3b7d-456a-9bfb-e778efd29638`

## Observações importantes

- Variáveis `EXPO_PUBLIC_*` são expostas no bundle — não armazenar segredos sensíveis aqui
- Regras de segurança do Firestore ficam versionadas em `firestore.rules` e devem ser validadas antes da implantação no projeto ativo
- O ID do projeto EAS está em `app.json` → `extra.eas.projectId`
- Firebase SDK v12 usa API modular — imports como `import { getAuth } from 'firebase/auth'`
- A inicialização verifica `getApps()` para evitar dupla-inicialização (hot reload / dev)
- `createPrimaryAuthInstance` e `createSecondaryAuthInstance` tratam o caso de auth já inicializado com `try/catch` → fallback para `getAuth()`; no Web, o equivalente usa `initializeAuth(..., { persistence: inMemoryPersistence })`
- App Check continua obrigatório para Firebase AI Logic, mas o enforcement não é estendido ao Firestore nesta etapa. O domínio do Hosting precisa estar autorizado no Console para evitar falha de App Check no navegador.
