import { useEffect, useRef, useState } from 'react';
import { login, register, requestPasswordReset } from '@/application/account';
import { errorMessage } from '@/application/errors';
import { getFirebaseClient } from '@/firebase/client';
import { validateProfileName } from '@/domain/profile';
import { useSession } from './useSession';
import { navigateToHomeDashboard } from '@/utils/navigation';

export type AccountAccessMode = 'login' | 'register' | 'reset';
type Options = {
	email: string;
	password: string;
	setPassword(value: string): void;
	setEmailError(value: string | null): void;
	setPasswordError(value: string | null): void;
	focusField(field: 'name' | 'email' | 'password'): void;
};
export function useAccountAccess(options: Options) {
	const [mode, setMode] = useState<AccountAccessMode>('login');
	const [name, setName] = useState('');
	const [nameError, setNameError] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isResetSent, setIsResetSent] = useState(false);
	const pending = useRef(false);
	const session = useSession();
	const [acceptedUid, setAcceptedUid] = useState<string | null>(null);
	useEffect(() => {
		if (acceptedUid && session.user?.uid === acceptedUid) navigateToHomeDashboard();
	}, [acceptedUid, session.user?.uid]);
	const changeMode = (next: AccountAccessMode) => {
		if (pending.current) return;
		setMode(next);
		options.setPassword('');
		options.setEmailError(null);
		options.setPasswordError(null);
		setNameError(null);
		setFeedback(null);
		setIsResetSent(false);
	};
	const submit = async () => {
		if (pending.current || isResetSent) return;
		const email = options.email.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
			options.setEmailError('Informe um email válido.');
			options.focusField('email');
			return;
		}
		if (mode === 'register') {
			const invalid = validateProfileName(name);
			setNameError(invalid);
			if (invalid) {
				options.focusField('name');
				return;
			}
		}
		if (mode !== 'reset' && (!options.password || (mode === 'register' && options.password.length < 8))) {
			options.setPasswordError(
				mode === 'register' ? 'Use pelo menos 8 caracteres na senha.' : 'Informe sua senha.',
			);
			options.focusField('password');
			return;
		}
		pending.current = true;
		setIsSubmitting(true);
		setFeedback(null);
		try {
			const client = getFirebaseClient();
			if (mode === 'reset') {
				await requestPasswordReset(client, email);
				setIsResetSent(true);
				setFeedback({
					type: 'success',
					message: 'Se houver uma conta com este email, você receberá um link para redefinir a senha.',
				});
			} else {
				const user =
					mode === 'register'
						? await register(client, name, email, options.password)
						: (await login(client, email, options.password)).user;
				options.setPassword('');
				if (mode === 'register') await session.reload();
				setAcceptedUid(user.uid);
			}
		} catch (error) {
			setFeedback({ type: 'error', message: errorMessage(error) });
		} finally {
			pending.current = false;
			setIsSubmitting(false);
		}
	};
	return {
		mode,
		changeMode,
		name,
		setName,
		nameError,
		setNameError,
		feedback: feedback ?? (session.error ? { type: 'error' as const, message: session.error } : null),
		isSubmitting,
		isResetSent,
		submit,
	};
}
