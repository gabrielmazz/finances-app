<h1 align="center">Lumus Finanças</h1>
<p align="center" style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">
    <img src="https://img.shields.io/badge/Expo-54.0-000000?style=for-the-badge&logo=expo&logoColor=white" alt="Expo Badge" />
    <img src="https://img.shields.io/badge/React%20Native-0.81.5-61DAFB?style=for-the-badge&logo=react&logoColor=20232A" alt="React Native Badge" />
    <img src="https://img.shields.io/badge/TypeScript-5.9-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript Badge" />
    <img src="https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=000" alt="Firebase Badge" />
</p>
<p align="center" style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">
    <img src="https://img.shields.io/badge/Codex-ChatGPT%20API-10A37F?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI Codex Badge" />
    <img src="https://img.shields.io/badge/Gluestack%20UI-NativeWind-7B61FF?style=for-the-badge&logo=gluestack&logoColor=white" alt="Gluestack UI Badge" />
    <img src="https://img.shields.io/badge/react--native--gifted--charts-1.6.0-FF6C37?style=for-the-badge&logo=npm&logoColor=white" alt="Gifted Charts Badge" />
</p>

<p style="text-align:justify;">
    O aplicativo <strong>Lumus Finanças</strong> é uma solução mobile completa para a gestão financeira pessoal e familiar, criada para oferecer uma visão clara, organizada e acessível das finanças da casa. Com uma interface simples e intuitiva, pensada para todos os tipos de usuários, ele permite acompanhar de forma detalhada as despesas, os ganhos, os investimentos e as movimentações bancárias do dia a dia, do mês e do ano. Além do controle financeiro tradicional, o Lumus Finanças possibilita vincular todas as pessoas que compartilham as finanças da família, centralizando as informações em um único lugar. Assim, todos conseguem visualizar quanto está sendo gasto, o que está sendo recebido e como o dinheiro está sendo utilizado ao longo do tempo, tornando o planejamento financeiro mais transparente, colaborativo e eficiente.
</p>

<h2 align="center">Funcionalidades</h2>

<p align="center">
  <img src="./assets/UnDraw/bankMovementsScreen.svg" width="400" alt="Funcionalidades de movimentações bancárias" />
</p>

-   Dashboard mensal com indicadores de ganhos/despesas, gráficos de barras e pizza com legendas dinâmicas.
-   Detalhamento anual por mês e por banco, com alternância entre visualizações bar/pie e expansão por interação.
-   Gestão completa de movimentações bancárias (ganhos, despesas e recorrências), com filtros por período, tags e bancos.
-   Tela dedicada a investimentos com cálculo de rentabilidade diária baseado no CDI, sincronização manual e registro de cláusulas de resgate.
-   Alertas flutuantes, drawer/modal para edição rápida e navegação Expo Router.
-   Integração total com Firebase Auth, Firestore e armazenamento de múltiplos apps (principal e secundário) para operações paralelas.

<p align="center" style="display:flex;gap:12px;justify-content:center;align-items:flex-start;flex-wrap:wrap;">
  <img src="./assets/Telas do Sistema/img01.jpg" width="22%" alt="Tela 1 do Lumus Finanças" />
  <img src="./assets/Telas do Sistema/img02.jpg" width="22%" alt="Tela 2 do Lumus Finanças" />
  <img src="./assets/Telas do Sistema/img03.jpg" width="22%" alt="Tela 3 do Lumus Finanças" />
  <img src="./assets/Telas do Sistema/img04.jpg" width="22%" alt="Tela 4 do Lumus Finanças" />
</p>


<h2 align="center">Tecnologias usadas</h2>

<p align="center">
  <img src="./assets/UnDraw/financialListScreen.svg" width="420" alt="Ilustração sobre tecnologias" />
</p>

<table align="center">
  <tr>
    <td align="center" width="170">
      <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" height="48" alt="React Native" />
      <br /><strong>React Native + Expo</strong>
      <br /><sub>Interfaces móveis, Expo Router e Metro bundler otimizados.</sub>
    </td>
    <td align="center" width="170">
      <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" height="48" alt="TypeScript" />
      <br /><strong>TypeScript</strong>
      <br /><sub>Modelagem forte de dados e hooks reutilizáveis.</sub>
    </td>
    <td align="center" width="170">
      <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/firebase/firebase-plain.svg" height="48" alt="Firebase" />
      <br /><strong>Firebase Auth & Firestore</strong>
      <br /><sub>Login seguro, sync em tempo real e apps secundários.</sub>
    </td>
    <td align="center" width="170">
      <img src="https://avatars.githubusercontent.com/u/120183344?s=280&v=4" height="48" alt="Gluestack UI" />
      <br /><strong>Gluestack UI + NativeWind</strong>
      <br /><sub>Design e componentes.</sub>
    </td>
    <td align="center" width="170">
      <img src="https://cdn-icons-png.flaticon.com/512/9462/9462901.png" height="48" alt="Gifted Charts" />
      <br /><strong>react-native-gifted-charts</strong>
      <br /><sub>Gráficos de barras, pizza.</sub>
    </td>
  </tr>
</table>

<h2 align="center">Instalação</h2>

<p align="center">
  <img src="./assets/UnDraw/addRegisterTagScreen.svg" width="420" alt="Ilustração sobre tecnologias" />
</p>

```bash
git clone git@github.com:gabrielmazz/finances-app.git
cd finances-app
npm install
```

- Use Node.js 20 ou superior e o npm do projeto. O Expo CLI é executado localmente por `npx`/scripts; não é necessário instalar `expo-cli` globalmente.
- Para Android com recursos nativos (Firebase AI, App Check e áudio), use um development build. Expo Go não cobre todos esses módulos.
- Antes de um build EAS, configure as variáveis e credenciais descritas em `Arquitetura/Firebase Config.md`.

<h2 align="center">Rodando o projeto</h2>

<p align="center">
  <img src="./assets/UnDraw/homeScreen.svg" width="420" alt="Ilustração sobre tecnologias" />
</p>

```bash
# Metro com a configuração atual de ambiente, sem reset automático
npm run start

# Ambiente local Android: inicia/semeia o Emulator demo e prepara o device
npm run dev:local

# Execução por plataforma
npm run android
npm run ios
npm run web
```

`npm run dev:local` prepara dados de demonstração e pode apagar o estado local do Emulator. Use `npm run start` quando não quiser esse reset e confirme o alvo Firebase configurado no ambiente. O aplicativo usa Firebase; veja a configuração completa em [Arquitetura/Firebase Config.md](Arquitetura/Firebase%20Config.md).

<h2 align="center">Criação das variáveis de ambientes</h2>

<p align="center">
  <img src="./assets/UnDraw/monthlyBankSummaryScreen.svg" width="420" alt="Ilustração sobre tecnologias" />
</p>

Crie um arquivo `.env` com as chaves do seu projeto Firebase:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=xxxxxxx.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=xxxxxxxx
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=xxxxxxxx.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
EXPO_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:xxxxxxxxxxxxxx
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

-   Variáveis `EXPO_PUBLIC_*` são incorporadas no cliente e não podem conter segredos. Use-as somente para a configuração pública do Firebase.
-   Para builds EAS, defina os valores no ambiente EAS correspondente. `GOOGLE_SERVICES_JSON` é um arquivo de credencial nativa e deve permanecer fora do repositório.
-   Nunca faça commit de arquivos `.env` de produção, `google-services.json` ou `GoogleService-Info.plist`.

<h2 align="center">Estrutura do projeto</h2>

```text
app/               adaptadores de rota do Expo Router
components/app/    providers, guard autenticado e ciclo de vida global
screens/           orquestração das telas por domínio
components/uiverse componentes visuais e interações reutilizáveis do produto
components/ui/     primitivas geradas pelo Gluestack
contexts/          estado transversal (sessão, tema, privacidade e preferências)
functions/         persistência e operações Firebase
hooks/             estado e efeitos reutilizáveis
utils/             helpers, navegação e adaptadores de plataforma
Arquitetura/       vault de decisões e contratos do sistema
```

Os limites detalhados, incluindo quando criar uma variante `.web.tsx`, estão em [Arquitetura/Organização do Código.md](Arquitetura/Organiza%C3%A7%C3%A3o%20do%20C%C3%B3digo.md).

<h2 align="center">Validação</h2>

```bash
npm run test -- --runInBand
npm run typecheck
npm run typecheck:backend
npm run web:export
```

Para mudanças de layout nativo, gere também o bundle Android com `npx expo export --platform android` ou execute o development build.

<h2 align="center">Autor</h2>

<p align="center">
  <img src="https://avatars.githubusercontent.com/gabrielmazz" width="110" height="110" style="border-radius: 50%; object-fit: cover;" alt="Foto de Gabriel Mazzuco" />
</p>
<p align="center">
  <strong>Gabriel Mazzuco</strong><br />
  Cientista da computação, formado na Universidade Estadual do Oeste do Paraná (Unioeste) em 2025, atuando na área de desenvolvimento de software desde então. Sempre buscando novas tecnologias e soluções para criar novos projetos.
</p>
<p align="center">
  <a href="https://github.com/gabrielmazz">GitHub</a> &nbsp;|&nbsp; 
  <a href="https://www.linkedin.com/in/gabriel-alves-mazzuco">LinkedIn</a> &nbsp;|&nbsp;
  <a href="mailto:gabrielalvesmazzuco@gmail.com">E-mail</a>
</p>
