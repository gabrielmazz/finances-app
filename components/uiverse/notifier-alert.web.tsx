import React from 'react';
import { createPortal } from 'react-dom';
import '@mantine/core/styles.css';
import { Alert, MantineProvider } from '@mantine/core';
import { CheckCircleIcon, InfoIcon, WarningCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import AnimatedContent from '@/components/web/AnimatedContent';

export type NotifierAlertType = 'error' | 'warn' | 'info' | 'success';

type WebAlertMessage = {
	title?: string;
	description: string;
	type: NotifierAlertType;
};

export type ShowNotifierAlertParams = {
	title?: string;
	description: string;
	type?: NotifierAlertType;
	duration?: number;
	isDarkMode?: boolean;
};

const MESSAGE_TYPE = 'lumus:notifier-alert';

const DEFAULT_TITLES: Record<NotifierAlertType, string> = {
	error: 'Erro',
	warn: 'Atenção',
	info: 'Aviso',
	success: 'Sucesso',
};

const ALERT_COLORS: Record<NotifierAlertType, string> = {
	error: 'red',
	warn: 'yellow',
	info: 'blue',
	success: 'green',
};

const ALERT_ICONS: Record<NotifierAlertType, React.ReactNode> = {
	error: <XCircleIcon size={22} weight="fill" />,
	warn: <WarningCircleIcon size={22} weight="fill" />,
	info: <InfoIcon size={22} weight="fill" />,
	success: <CheckCircleIcon size={22} weight="fill" />,
};

export const showNotifierAlert = ({
	title,
	description,
	type = 'info',
	duration = 3500,
}: ShowNotifierAlertParams) => {
	if (typeof window === 'undefined') return;

	window.dispatchEvent(
		new CustomEvent(MESSAGE_TYPE, {
			detail: { title, description, type, duration },
		}),
	);
};

export const NotifierAlert = () => null;

export const WebNotifierAlertHost = () => {
	const [alert, setAlert] = React.useState<WebAlertMessage | null>(null);
	const [duration, setDuration] = React.useState(3500);
	const handleDisappearanceComplete = React.useCallback(() => {
		setAlert(null);
	}, []);

	React.useEffect(() => {
		const handleAlert = (event: Event) => {
			const detail = (event as CustomEvent<WebAlertMessage & { duration?: number }>).detail;
			if (!detail?.description) return;
			setAlert(detail);
			setDuration(detail.duration ?? 3500);
		};

		window.addEventListener(MESSAGE_TYPE, handleAlert);
		return () => window.removeEventListener(MESSAGE_TYPE, handleAlert);
	}, []);

	if (typeof document === 'undefined') return null;

	return createPortal(
		<MantineProvider forceColorScheme="light">
			<div
				style={{
					position: 'fixed',
					top: 20,
					right: 20,
					zIndex: 99999,
					width: 'min(420px, calc(100vw - 40px))',
				}}
			>
				{alert ? (
					<AnimatedContent
						distance={300}
						direction="horizontal"
						reverse={false}
						disappearReverse
						duration={1}
						ease="power3.out"
						initialOpacity={0}
						animateOpacity
						scale={1}
						threshold={0.1}
						delay={0}
						disappearAfter={Math.max(duration / 1000 - 1 - 0.5, 0)}
						disappearDuration={0.5}
						onDisappearanceComplete={handleDisappearanceComplete}
					>
						<Alert
							variant="filled"
							color={ALERT_COLORS[alert.type]}
							title={alert.title ?? DEFAULT_TITLES[alert.type]}
							icon={ALERT_ICONS[alert.type]}
							withCloseButton
							onClose={() => setAlert(null)}
						>
							{alert.description}
						</Alert>
					</AnimatedContent>
				) : null}
			</div>
		</MantineProvider>,
		document.body,
	);
};

export default NotifierAlert;
