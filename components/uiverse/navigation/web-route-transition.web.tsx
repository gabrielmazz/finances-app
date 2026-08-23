import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createPortal } from 'react-dom';

import { useAppTheme } from '@/contexts/ThemeContext';

const ROUTE_TRANSITION_DURATION_SECONDS = 0.32;

/**
 * Web-only route feedback. The Expo Router Stack remains responsible for
 * navigation; Motion only covers the committed route change in the DOM layer.
 */
export default function WebRouteTransition() {
	const { isDarkMode } = useAppTheme();
	const shouldReduceMotion = useReducedMotion();
	const transitionSequenceRef = React.useRef(0);
	const [transitionId, setTransitionId] = React.useState<string | null>(null);

	React.useEffect(() => {
		const startTransition = () => {
			transitionSequenceRef.current += 1;
			setTransitionId(`route-${transitionSequenceRef.current}`);
		};
		window.addEventListener('lumus:web-route-transition', startTransition);
		return () => window.removeEventListener('lumus:web-route-transition', startTransition);
	}, []);

	React.useEffect(() => {
		if (!transitionId) return;

		const timeoutId = window.setTimeout(() => setTransitionId(null), ROUTE_TRANSITION_DURATION_SECONDS * 1000);
		return () => window.clearTimeout(timeoutId);
	}, [transitionId]);

	if (shouldReduceMotion || !transitionId || typeof document === 'undefined') {
		return null;
	}

	return createPortal(
		<AnimatePresence initial={false}>
			<motion.div
				key={transitionId}
				aria-hidden="true"
				initial={{ opacity: 1, scaleX: 1 }}
				animate={{ opacity: 0, scaleX: 0 }}
				exit={{ opacity: 0, scaleX: 0 }}
				transition={{ duration: ROUTE_TRANSITION_DURATION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
				style={{
					position: 'fixed',
					top: 0,
					left: 0,
					width: '100vw',
					height: '100vh',
					zIndex: 9999,
					pointerEvents: 'none',
					transformOrigin: 'left center',
					backgroundColor: isDarkMode ? '#0f172a' : '#e0f2fe',
				}}
			/>
		</AnimatePresence>,
		document.body,
	);
}
