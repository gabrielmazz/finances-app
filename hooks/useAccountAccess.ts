import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
import { useState } from 'react';
export type AccountAccessMode = 'login' | 'register' | 'reset';
type Options = {
	email: string;
	password: string;
	setPassword(value: string): void;
	setEmailError(value: string | null): void;
	setPasswordError(value: string | null): void;
	focusField(field: 'name' | 'email' | 'password'): void;
};
export function useAccountAccess({ setPassword, setEmailError, setPasswordError }: Options) {
	const [mode, setMode] = useState<AccountAccessMode>('login');
	const [name, setName] = useState('');
	const [nameError, setNameError] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<{ type: 'error'; message: string } | null>(null);
	const changeMode = (next: AccountAccessMode) => {
		setMode(next);
		setPassword('');
		setEmailError(null);
		setPasswordError(null);
		setNameError(null);
		setFeedback(null);
	};
	const submit = async () => {
		setFeedback({ type: 'error', message: FEATURE_UNAVAILABLE_MESSAGE });
	};
	return {
		mode,
		changeMode,
		name,
		setName,
		nameError,
		setNameError,
		feedback,
		isSubmitting: false,
		isResetSent: false,
		submit,
	};
}
