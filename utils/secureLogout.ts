import { signOut, type User } from 'firebase/auth';

import { auth } from '@/FirebaseConfig';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import { getUserDataFirebase } from '@/functions/RegisterUserFirebase';
import {
	clearMandatoryReminderAccount,
	finalizeMandatoryReminderAccountCleanup,
} from '@/utils/mandatoryReminderNotifications';
import { synchronizeMandatoryReminderAccount } from '@/utils/mandatoryReminderAccountSync';
import { finishRemoteNotificationLogout, unregisterRemoteNotificationDevice } from '@/utils/remoteNotifications';
import { clearFinancePersistedDataForLogout, resumeFinancePersistedDataAfterFailedLogout } from '@/contexts/FinanceDataContext';
import { clearLocalAnnotationsForLogout, resumeLocalAnnotationsAfterFailedLogout } from '@/utils/localAnnotations';

type SecureLogoutOptions = {
	isDarkMode: boolean;
	userId?: string | null;
	displayName?: string | null;
};

// [[Segurança de Login]]: falha de limpeza não autoriza manter acesso expirado.
// O AuthProvider bloqueia as rotas antes de chamar esta rotina.
export const cleanupExpiredSession = async (candidate: User) => {
	if (auth.currentUser !== candidate) return;
	const uid = candidate.uid;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		const pushCleanup = unregisterRemoteNotificationDevice(uid);
		const results = await Promise.allSettled([
			clearFinancePersistedDataForLogout(uid),
			clearLocalAnnotationsForLogout(uid),
			clearMandatoryReminderAccount(uid).then(async cleared => {
				if (cleared) await finalizeMandatoryReminderAccountCleanup(uid);
			}),
			Promise.race([
				pushCleanup,
				new Promise<void>(resolve => { timeout = setTimeout(resolve, 2000); }),
			]),
		]);
		if (results.some(result => result.status === 'rejected')) {
			console.warn('Parte dos dados locais da sessão expirada não pôde ser removida.');
		}
	} finally {
		if (timeout) clearTimeout(timeout);
		finishRemoteNotificationLogout(uid);
	}
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
		await unregisterRemoteNotificationDevice(accountId);
		await clearFinancePersistedDataForLogout(accountId);
		await clearLocalAnnotationsForLogout(accountId);
		if (auth.currentUser?.uid !== accountId) return;
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
		resumeFinancePersistedDataAfterFailedLogout(accountId);
		resumeLocalAnnotationsAfterFailedLogout(accountId);
		console.error('Erro ao deslogar usuário:', error);
		const remindersRestored = await restoreCurrentAccountReminders();
		showNotifierAlert({
			description: remindersRestored
				? 'Não foi possível encerrar a sessão. Os lembretes foram restaurados; tente sair novamente.'
				: 'Não foi possível encerrar a sessão nem restaurar os lembretes agora. Verifique a conexão e tente novamente.',
			type: 'error',
			isDarkMode,
		});
	} finally {
		finishRemoteNotificationLogout(accountId);
	}
};
