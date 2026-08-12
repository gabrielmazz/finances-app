// FirebaseConfig.ts
// Jest e ferramentas sem resolução por plataforma usam a mesma implementação
// nativa; Metro usa FirebaseConfig.web.ts no navegador.
export * from './FirebaseConfig.native';
