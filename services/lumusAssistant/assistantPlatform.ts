// O Metro escolhe .native.ts ou .web.ts. Este reexport mantém o TypeScript e
// ferramentas sem resolução por plataforma apontando para o contrato nativo.
export * from './assistantPlatform.native';
