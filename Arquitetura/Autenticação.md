---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Autenticação

Login, cadastro, recuperação e logout mantêm os formulários Web/mobile e usam Auth oficial no Emulator Suite. `SessionContext` usa um observador `onIdTokenChanged` para revalidar também claims, compartilha perfil e descarta respostas de contas anteriores. Persistência Web local/nativa AsyncStorage pelo SDK. Workspace protegido; acesso anônimo não abre telas de dados.

Cadastro é do próprio usuário desconectado, com perfil mínimo transacional. Falha após criar Auth preserva conta/UID; conclusão do perfil ocorre explicitamente em Meu perfil. Contas legadas entram pelo UID existente, sem recadastro/migração. Mensagem de reset não revela existência da conta. Nenhuma senha/token é registrada no diagnóstico.

O ambiente padrão é o projeto demo local. As Rules foram publicadas com autorização em 09/11 e seu hash verificado; produção pode ser configurada explicitamente usando o mesmo app/projeto. O novo frontend não foi distribuído. A inspeção somente leitura antes/depois da publicação confirmou correspondência dos mesmos dois perfis/UIDs e provedor password em produção, sem usar senhas reais. A homologação Web real autorizada passou em oito cenários, incluindo perfil/UID, reinício completo de navegador, offline, logout e sessão local inválida, sem alteração de contas/documentos. Android físico SM_S926B foi homologado no Expo Go57.0.9: sessão/perfil/UID, reinício, offline/reconexão e logout/link protegido verificados. Login e logout foram manuais; estados e persistência foram observados por ADB. Não equivale a build standalone ou iOS físico. Três contas Auth reais foram exportadas cifradas separadamente; a recuperação integrada Auth/Firestore/UI passou com quatro contas sintéticas. Senhas SCRYPT reais e OAuth externo não foram restaurados em servidor produtivo. Ver [[Homologação e Recuperação da Etapa 03]]. Permissões de grupo exigem claim `lumusAccess` + autorização protegida, sem confiar nos vínculos antigos. Detalhes: [[Segurança e Preparação para Produção]] e [[Fundação Firebase Spark]].

## Arquivos de apresentação

LoginScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.
