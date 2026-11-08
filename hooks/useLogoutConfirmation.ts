import { APP_ROUTE_PATHS, replaceToRoute } from '@/utils/navigation';
import { useState } from 'react';
export function useLogoutConfirmation() {
	const [isOpen, setIsOpen] = useState(false);
	return {
		isOpen,
		isLoggingOut: false,
		requestLogout: () => setIsOpen(true),
		cancelLogout: () => setIsOpen(false),
		confirmLogout: async () => {
			setIsOpen(false);
			replaceToRoute(APP_ROUTE_PATHS.login);
		},
	};
}
