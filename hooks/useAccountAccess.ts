import { useRef, useState } from 'react';
import { registerUserFirebase, requestPasswordResetFirebase } from '@/functions/RegisterUserFirebase';
import { isEmailFormatValid, normalizeEmailForAuth } from '@/utils/loginSecurity';

export type AccountAccessMode = 'login' | 'register' | 'reset';

const RESET_SUCCESS_MESSAGE = 'Se houver uma conta com este email, você receberá um link para redefinir a senha. Confira também a pasta de spam.';

type Options = {
	email: string;
	password: string;
	setPassword: (value: string) => void;
	setEmailError: (value: string | null) => void;
	setPasswordError: (value: string | null) => void;
	focusField: (field: 'name' | 'email' | 'password') => void;
};

const messages: Record<string, string> = {
	'auth/email-already-in-use': 'Este email já está cadastrado. Entre na sua conta ou redefina a senha.',
	'auth/invalid-email': 'Informe um email válido.',
	'auth/weak-password': 'Escolha uma senha mais forte, com pelo menos 6 caracteres.',
	'auth/password-does-not-meet-requirements': 'A senha não atende aos requisitos de segurança. Use uma senha mais longa com maiúsculas, minúsculas, números e símbolos.',
	'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
	'auth/network-request-failed': 'Não foi possível conectar. Verifique sua internet e tente novamente.',
	'auth/operation-not-allowed': 'Este serviço está indisponível. Tente novamente mais tarde.',
	'auth/profile-creation-incomplete': 'A conta foi criada, mas o perfil não pôde ser salvo. Entre em contato com o suporte antes de tentar novamente.',
};

export function useAccountAccess({ email, password, setPassword, setEmailError, setPasswordError, focusField }: Options) {
	const [mode, setMode] = useState<AccountAccessMode>('login');
	const [name, setName] = useState('');
	const [nameError, setNameError] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [resetSentTo, setResetSentTo] = useState<string | null>(null);
	const pending = useRef(false);
	const isResetSent = mode === 'reset' && resetSentTo === normalizeEmailForAuth(email);

	const changeMode = (next: AccountAccessMode) => {
		if (pending.current) return;
		setMode(next);
		setPassword('');
		setEmailError(null);
		setPasswordError(null);
		setNameError(null);
		setFeedback(null);
	};

	const submit = async () => {
		if (pending.current || mode === 'login' || isResetSent) return;
		setFeedback(null);
		const normalizedEmail = normalizeEmailForAuth(email);
		const invalidName = mode === 'register' && !name.trim();
		const invalidEmail = !isEmailFormatValid(normalizedEmail);
		const invalidPassword = mode === 'register' && password.length < 6;
		setNameError(invalidName ? 'Informe seu nome.' : null);
		setEmailError(invalidEmail ? 'Informe um email válido.' : null);
		setPasswordError(invalidPassword ? 'Use pelo menos 6 caracteres na senha.' : null);
		if (invalidName || invalidEmail || invalidPassword) {
			focusField(invalidName ? 'name' : invalidEmail ? 'email' : 'password');
			return;
		}

		pending.current = true;
		setIsSubmitting(true);
		try {
			if (mode === 'register') {
				const result = await registerUserFirebase({ name: name.trim(), email: normalizedEmail, password, adminUser: false });
				if (!result.success) throw result.error;
				setPassword('');
				setName('');
				setMode('login');
				setFeedback({ type: 'success', message: 'Conta criada. Entre com seu email e senha.' });
			} else {
				await requestPasswordResetFirebase(normalizedEmail);
				setResetSentTo(normalizedEmail);
				setFeedback(null);
			}
		} catch (error) {
			const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
			setFeedback({ type: 'error', message: messages[code] ?? 'Não foi possível concluir a solicitação. Tente novamente em instantes.' });
		} finally {
			pending.current = false;
			setIsSubmitting(false);
		}
	};

	const visibleFeedback = isResetSent ? { type: 'success' as const, message: RESET_SUCCESS_MESSAGE } : feedback;
	return { mode, changeMode, name, setName, nameError, setNameError, feedback: visibleFeedback, isSubmitting, isResetSent, submit };
}
