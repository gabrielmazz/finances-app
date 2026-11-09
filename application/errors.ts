export function errorMessage(error: unknown): string {
	const code =
		error && typeof error === 'object' && 'code' in error
			? String(error.code)
			: error instanceof Error
				? error.message
				: '';
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
	if (code === 'auth/too-many-requests' || code === 'resource-exhausted')
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
