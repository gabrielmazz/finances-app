import { logout } from '@/application/account';
import { errorMessage } from '@/application/errors';
import { getFirebaseClient } from '@/firebase/client';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import { APP_ROUTE_PATHS, replaceToRoute } from '@/utils/navigation';
import { useRef, useState } from 'react';
export function useLogoutConfirmation() {
	const [isOpen, setIsOpen] = useState(false);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const pending = useRef(false);
	return {
		isOpen,
		isLoggingOut,
		requestLogout: () => setIsOpen(true),
		cancelLogout: () => {
			if (!pending.current) setIsOpen(false);
		},
		confirmLogout: async () => {
			if (pending.current) return;
			pending.current = true;
			setIsLoggingOut(true);
			try {
				await logout(getFirebaseClient());
				setIsOpen(false);
				replaceToRoute(APP_ROUTE_PATHS.login);
			} catch (error) {
				showNotifierAlert({ description: errorMessage(error), type: 'error' });
			} finally {
				pending.current = false;
				setIsLoggingOut(false);
			}
		},
	};
}
