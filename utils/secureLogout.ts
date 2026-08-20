import { signOut } from 'firebase/auth';

import { auth } from '@/FirebaseConfig';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import {
	clearMandatoryReminderAccount,
	finalizeMandatoryReminderAccountCleanup,
} from '@/utils/mandatoryReminderNotifications';
import { synchronizeMandatoryReminderAccount } from '@/utils/mandatoryReminderAccountSync';

type SecureLogoutOptions = {
	isDarkMode: boolean;
	userId?: string | null;
	displayName?: string | null;
};

// [[Navegação]]: a sessão só encerra depois da limpeza confirmada dos lembretes
// do UID que iniciou a ação; callbacks tardios não podem afetar outra conta.
export const logoutCurrentUser = async ({
	isDarkMode,
	userId,
	displayName,
}: SecureLogoutOptions) => {
	const accountId = userId?.trim();
	if (!accountId || auth.currentUser?.uid !== accountId) {
		return;
	}

	let userName = displayName?.trim() || null;
	try {
		const userData = await getUserDataFirebase(accountId);
		if (userData.success) {
			const storedName = (userData.data as { name?: unknown })?.name;
			if (typeof storedName === 'string' && storedName.trim()) {
				userName = storedName.trim().split(/\s+/)[0] ?? userName;
			}
		}
	} catch {
		// O nome exibido é somente um detalhe do feedback de saída.
	}

	const restoreCurrentAccountReminders = async () => {
		if (auth.currentUser?.uid !== accountId) {
			return false;
		}

		try {
			return (await synchronizeMandatoryReminderAccount(accountId)).complete;
		} catch (error) {
			console.error('Erro ao restaurar lembretes após falha no logout:', error);
			return false;
		}
	};

	let remindersCleared = false;
	try {
		remindersCleared = await clearMandatoryReminderAccount(accountId);
	} catch (error) {
		console.error('Erro ao limpar lembretes locais durante o logout:', error);
	}

	if (!remindersCleared) {
		if (auth.currentUser?.uid === accountId) {
			const remindersRestored = await restoreCurrentAccountReminders();
			showNotifierAlert({
				description: remindersRestored
					? 'Não foi possível concluir a limpeza. A sessão e os lembretes foram restaurados; tente sair novamente.'
					: 'Não foi possível limpar os lembretes deste dispositivo. Por segurança, a sessão continua ativa; verifique a conexão e tente novamente.',
				type: 'error',
				isDarkMode,
			});
		}
		return;
	}

	if (auth.currentUser?.uid !== accountId) {
		return;
	}

	try {
		await signOut(auth);
		try {
			await finalizeMandatoryReminderAccountCleanup(accountId);
		} catch (error) {
			console.error('Erro ao finalizar a limpeza local após logout:', error);
		}
		showNotifierAlert({
			description: userName ? `Até mais, ${userName}!` : 'Até mais!',
			type: 'info',
			isDarkMode,
		});
	} catch (error) {
		console.error('Erro ao deslogar usuário:', error);
		const remindersRestored = await restoreCurrentAccountReminders();
		showNotifierAlert({
			description: remindersRestored
				? 'Não foi possível encerrar a sessão. Os lembretes foram restaurados; tente sair novamente.'
				: 'Não foi possível encerrar a sessão nem restaurar os lembretes agora. Verifique a conexão e tente novamente.',
			type: 'error',
			isDarkMode,
		});
	}
};
