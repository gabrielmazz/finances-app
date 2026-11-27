---
tags: [frontend, arquitetura]
relacionado: [[MOC - Lumus Finanças]], [[Remoção do Backend]]
status: ativo
tipo: arquitetura
versao: 3.0.0
---

# Gerenciamento de Usuários

Em Meu perfil, **Contas vinculadas** lista até cinco grupos previamente autorizados e ativos. O cliente exige o token Auth e a geração correspondente no grant protegido e verifica cada grupo no servidor. A seção identifica o contexto e o papel atual. Quando o documento protegido contém participantes informados, só o grupo selecionado mostra essa lista. A permissão efetiva continua no grant de cada titular.

Na 1.7, abrir um grupo muda o contexto das telas financeiras. O papel **Administrador** permite gravar quando o ambiente está liberado. **Participante** permite consultar. Nas duas situações, cada titular mantém seu contexto pessoal acessível. A saída voluntária da visualização usa **Voltar às contas pessoais**. A revogação administrativa do grant ou o encerramento do grupo retorna automaticamente ao contexto pessoal e descarta os dados da tela anterior.

No histórico do Git, o commit `594f2d2` registra o formulário **Vincular usuário**, com convite por ID, prévia, aceite pelo destinatário e revogação. O vínculo de pessoas era distinto da filiação a grupos. A 1.7 usa somente o contexto protegido atual para compartilhar finanças. O inventário oficial apresentou dois contextos pessoais e nenhum grupo ou grant protegido. Convite, aceite e saída com efeito em permissões oficiais dependem de autorização específica. O [roteiro da 1.7](../docs/mvp170-resultado.md) descreve a confirmação voluntária usando o modelo atual.

## Arquivos de apresentação

AddUserRelationScreen em `screens/mobile/` e, quando existente, `screens/web/`. Os adaptadores em `app/` e os componentes usados por essas telas permanecem no projeto.

Ver [[Remoção do Backend]] para recuperação, validação e limites atuais.

## Acesso vinculado na revisão de 25/11

O seletor lista grupos ativos com claim Auth e concessão vigente. Membros consultam o contexto autorizado e retornam ao pessoal se perderem a concessão. A aplicação anterior reconhecia um vínculo bilateral protegido ou referências mútuas acompanhadas de concessões bilaterais. A arquitetura canônica reserva contextos pessoais aos titulares. O inventário do corte não comprova concessão canônica para o vínculo pessoal citado. A recuperação do vínculo real exige confirmar a concessão protegida aplicável e sua correspondência com o contexto canônico.

A consulta agregada de 25/11 encontrou zero autorizações habilitadas e zero grupos ativos no projeto oficial. A leitura por coleção de vínculos Spark legados retornou HTTP 400. Nenhuma autorização de contexto pessoal de terceiros foi comprovada nessa consulta.
