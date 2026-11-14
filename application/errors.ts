export function errorMessage(error: unknown): string {
	const code =
		error && typeof error === 'object' && 'code' in error
			? String(error.code)
			: error instanceof Error
				? error.message
				: '';
	if (code === 'read-only/operation') return 'Esta versão permite apenas consultas. Nenhuma alteração foi realizada.';
	const bankErrors: Record<string, string> = {
		'banks/not-released': 'Bancos e saldo inicial ainda estão em homologação. Use o ambiente de testes.',
		'banks/invalid-context': 'Não foi possível identificar um contexto financeiro autorizado.',
		'banks/not-found': 'Esta conta não foi encontrada. Atualize a lista e tente novamente.',
		'banks/invalid-name': 'Informe um nome de conta com até 100 caracteres.',
		'banks/invalid-institution': 'Informe a instituição financeira, com até 100 caracteres.',
		'banks/invalid-type': 'Selecione o tipo da conta.',
		'banks/invalid-color': 'Selecione uma cor válida para a conta.',
		'banks/invalid-money': 'Informe um saldo válido em reais. Exemplo: 1.500,00.',
		'banks/money-limit': 'O valor excede o limite monetário permitido.',
		'banks/invalid-date': 'Informe uma data válida, até hoje, no formato dia/mês/ano.',
		'banks/invalid-reason': 'Para saldo negativo, informe um motivo de 3 a 500 caracteres.',
		'banks/invalid-operation': 'O identificador do cadastro não pôde ser recuperado. Não refaça a operação em outra tela.',
		'banks/operation-conflict': 'Este cadastro já foi enviado com outros dados. Consulte a conta salva antes de iniciar outro.',
		'banks/conflict': 'Esta conta mudou em outro acesso. Atualize os dados antes de salvar.',
		'banks/incompatible': 'Os dados desta conta precisam de revisão. O saldo não foi estimado e nenhum registro foi alterado.',
		'banks/reconciliation-required': 'Esta conta antiga precisa de conciliação antes de uma operação financeira.',
		'banks/nonzero-archive': 'Só é possível arquivar uma conta com saldo zero. O saldo não foi alterado.',
		'banks/archived': 'Esta conta está arquivada e não permite alterações.',
		'banks/intent-storage-unavailable': 'Não foi possível guardar o identificador do cadastro neste navegador. Use um navegador atualizado e permita o armazenamento local.',
	};
	if(bankErrors[code])return bankErrors[code];
	const categoryErrors: Record<string, string> = {
		'categories/not-released': 'Categorias ainda estão em validação. Use o ambiente de testes.',
		'categories/invalid-name': 'Informe um nome de categoria com até 100 caracteres.',
		'categories/invalid-type': 'Selecione onde a categoria será utilizada.',
		'categories/conflict': 'Esta categoria mudou em outro acesso. Atualize os dados e tente novamente.',
		'categories/operation-conflict': 'Este cadastro já foi enviado com outros dados. Consulte a lista antes de tentar novamente.',
		'categories/ambiguous': 'Algumas categorias precisam de revisão antes desta alteração.',
		'categories/legacy-usage': 'O uso desta categoria antiga não pode ser alterado com segurança.',
		'categories/not-found': 'Categoria não encontrada. Atualize a lista e tente novamente.',
		'categories/archived': 'Esta categoria foi removida e não pode ser alterada.',
	};
	if (categoryErrors[code]) return categoryErrors[code];
	const movementErrors: Record<string, string> = {
		'movements/invalid-name': 'Informe o nome do lançamento com até 100 caracteres.',
		'movements/invalid-amount': 'Informe um valor maior que zero.',
		'movements/amount-limit': 'O valor excede o limite permitido para a conta.',
		'movements/invalid-date': 'Informe uma data válida até hoje.',
		'movements/invalid-account': 'Selecione uma conta ativa com saldo disponível.',
		'movements/invalid-category': 'Selecione uma categoria ativa compatível com o lançamento.',
		'movements/conflict': 'O lançamento foi alterado em outro acesso. Atualize e tente novamente.',
		'movements/operation-conflict': 'Este cadastro já foi enviado com outros dados. Confira o extrato antes de tentar novamente.',
		'movements/invalid-explanation': 'Informe uma observação com até 500 caracteres.',
	};
	if (movementErrors[code]) return movementErrors[code];
	if (code.startsWith('config/'))
		return 'Não foi possível iniciar o serviço. Entre em contato com o responsável pelo aplicativo.';
	if (
		[
			'auth/invalid-credential',
			'auth/wrong-password',
			'auth/user-not-found',
			'auth/invalid-login-credentials',
		].includes(code)
	)
		return 'Não foi possível entrar. Confira seu email e sua senha.';
	if (code === 'auth/email-already-in-use')
		return 'Não foi possível criar a conta. Tente entrar ou recuperar sua senha.';
	if (code === 'auth/invalid-email') return 'Informe um email válido.';
	if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements')
		return 'Escolha uma senha que atenda aos requisitos da conta.';
	if (code === 'resource-exhausted') return 'A cota de operações do serviço foi atingida. Aguarde a liberação antes de tentar novamente.';
	if (code === 'aborted') return 'A operação encontrou acessos simultâneos. Atualize os dados e tente novamente com o mesmo cadastro.';
	if (code === 'failed-precondition') return 'O serviço recusou a operação nas condições atuais. Atualize os dados; se persistir, informe o responsável pelo aplicativo.';
	if (code === 'auth/too-many-requests')
		return 'Limite de tentativas atingido. Aguarde e tente novamente.';
	if (code === 'auth/user-disabled')
		return 'Esta conta está desativada. Entre em contato com o responsável pelo aplicativo.';
	if (code === 'auth/network-request-failed' || code === 'unavailable' || code === 'deadline-exceeded')
		return 'Sem conexão com o serviço. Confira a conexão e tente novamente.';
	if (code === 'permission-denied') return 'Você não tem permissão para acessar este recurso.';
	if (code === 'session/changed') return 'Sua sessão mudou. Entre novamente para continuar.';
	if (code === 'auth/already-signed-in') return 'Você já está conectado. Saia da conta antes de criar outra.';
	if (code === 'account/profile-incomplete')
		return 'A conta foi criada, mas o perfil não foi concluído. Continue no workspace e complete seu nome em Meu perfil.';
	if (code === 'context/access-denied' || code === 'context/invalid-group')
		return 'O contexto financeiro precisa ser verificado. Nenhum acesso compartilhado foi concedido.';
	if (code === 'profile/conflict')
		return 'Seu nome foi alterado em outro acesso. Atualize o perfil antes de salvar.';
	return 'Não foi possível concluir a operação. Tente novamente.';
}
