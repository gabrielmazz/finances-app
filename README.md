<h1 align="center">Lumus Finanças</h1>
<p align="center" style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;">
    <img src="https://img.shields.io/badge/Expo-54.0-000000?style=for-the-badge&logo=expo&logoColor=white" alt="Expo Badge" />
    <img src="https://img.shields.io/badge/React%20Native-0.81.5-61DAFB?style=for-the-badge&logo=react&logoColor=20232A" alt="React Native Badge" />
    <img src="https://img.shields.io/badge/TypeScript-5.2-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript Badge" />
    <img src="https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=000" alt="Firebase Badge" />
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

-   Certifique-se de ter Node.js LTS, Expo CLI (`npm install -g expo-cli` se preferir) e um emulador Android/iOS ou Expo Go.
-   Caso utilize o EAS Build, configure as credenciais no `eas.json` antes de prosseguir.

<h2 align="center">Rodando o projeto</h2>

<p align="center">
  <img src="./assets/UnDraw/homeScreen.svg" width="420" alt="Ilustração sobre tecnologias" />
</p>

```bash
# Versão Metro bundler + Expo Go
npm run start

# Build local em dev
npm run android   # ou npm run ios / npm run web
```

O aplicativo necessitta de um projeto Firebase, ou seja, crie um em [Firebase Console](https://console.firebase.google.com/) e configure corretamente todas as informações necessárias para um projeto simples no Firebase rodar em conjunto com a aplicação.

<h2 align="center">Criação das variáveis de ambientes</h2>

<p align="center">
  <img src="./assets/UnDraw/monthlyBankSummaryScreen.svg" width="420" alt="Ilustração sobre tecnologias" />
</p>

Crie um arquivo `.env` (ou configure em `app.config.ts/app.json` via `extra.firebase`) com as chaves do seu projeto Firebase:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=xxxxxxx.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=xxxxxxxx
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=xxxxxxxx.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
EXPO_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:xxxxxxxxxxxxxx
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

-   As variáveis podem ser lidas tanto do `.env` quanto do campo `expo.extra.firebase` (ver `FirebaseConfig.ts`).
-   Para builds EAS, defina os mesmos valores no painel de Secrets ou usando `eas secret:create`.
-   Nunca commit suas chaves de produção; mantenha arquivos `.env` no `.gitignore`.

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
