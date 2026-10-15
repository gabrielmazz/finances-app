import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { logoutCurrentUser } from '@/utils/secureLogout';

export function useLogoutConfirmation() {
	const { user } = useAuth();
	const { isDarkMode } = useAppTheme();
	const [pendingUserId, setPendingUserId] = useState<string | null>(null);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const logoutInFlight = useRef(false);

	useEffect(() => {
		setPendingUserId(null);
	}, [user?.uid]);

	const requestLogout = useCallback(() => {
		if (user?.uid && !logoutInFlight.current) setPendingUserId(user.uid);
	}, [user?.uid]);

	const cancelLogout = useCallback(() => {
		if (!logoutInFlight.current) setPendingUserId(null);
	}, []);

	const confirmLogout = useCallback(async () => {
		// [[Autenticação]]: uma confirmação antiga nunca encerra a nova conta.
		if (!pendingUserId || pendingUserId !== user?.uid || logoutInFlight.current) return;
		logoutInFlight.current = true;
		setIsLoggingOut(true);
		try {
			await logoutCurrentUser({ userId: pendingUserId, displayName: user.displayName, isDarkMode });
		} finally {
			logoutInFlight.current = false;
			setIsLoggingOut(false);
			setPendingUserId(null);
		}
	}, [pendingUserId, user?.uid, user?.displayName, isDarkMode]);

	return {
		isOpen: pendingUserId !== null && pendingUserId === user?.uid,
		isLoggingOut,
		requestLogout,
		cancelLogout,
		confirmLogout,
	};
}
