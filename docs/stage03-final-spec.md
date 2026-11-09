# Especificação da finalização da Etapa 03

Base Git `e86a55f`; alterações das etapas anteriores já estavam no worktree e devem ser preservadas. Não há autorização para nova publicação de Rules/Hosting, escrita financeira, exclusão/importação de contas em produção, mudança de UID ou serviço pago. Nenhum módulo da etapa 04.

- Confirmar Rules efetivas e hash; comprovar observação contínua >=60min, com métricas agregadas e limitações, sem tratar amostras pontuais ou séries ausentes como prova de continuidade/zero erros.
- Homologar web no Firebase real exclusivamente com conta indicada pelo proprietário, sem senha/UID/email em evidências versionadas. Login válido/inválido, perfil, persistência em reload/reinício, offline/reconexão, logout, sessão local inválida, sem duplicação de signin nem escrita financeira.
- Homologar aparelho físico somente se realmente disponível; ADB/Expo/ambiente preparados não equivalem a execução no dispositivo. Não substituir app publicado nem distribuir build sem autorização.
- Criptografia/integridade mantidas, cópia gravada/acessível no destino autorizado, key privada; originalmente pedida independência, mas o proprietário explicitamente autorizou chave no mesmo local. Registrar essa decisão e ausência de independência, sem afirmar proteção contra perda do host.
- Recuperação Auth separada: preservar UID, email, nome, provedores, verificação/disabled e material exportável; nunca registrar hashes/params e nunca importar em produção. Emulador não comprova verificação de Firebase SCRYPT nem OAuth externo; declarar limites.
- Executar recuperação integrada sintética Auth+Firestore, IDs/tipos/hierarquia/relacionamentos/valores e login/perfil na interface real restaurada, não apenas SDK/unitário.
- Corrigir falhas dentro do escopo e executar tipos/testes/compilação; preservar UI e Spark.
- Entregar tabela Implementado/Testado/Homologado/Pendente com evidências e somente bloqueios reais externos.

Decisões registradas: conta real autorizada, login manual; destino UNC corresponde a /programacao/finances-app-recovery-20261108; co-localização da chave expressamente aceita; proprietário pretende conectar Android por USB. Exportação real Auth sensível autorizada separadamente e executada. Android detectado após diagnóstico USB; Expo Go58 não abre SDK57, APK57 oficial conferido e downgrade não destrutivo recusado; substituição do Expo Go foi autorizada explicitamente e executada (57.0.9 conferido). Homologação física assistida executada: login/menu/logout manuais, perfil/sessão/reconexão/guards verificados por ADB. O recibo distingue a transição inicial de login não capturada e os dois segmentos de validação.
