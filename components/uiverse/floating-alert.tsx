import React from 'react';
import type { ViewStyle } from 'react-native';
import { View } from 'react-native';
import { Alert, AlertText, AlertIcon } from '@/components/ui/alert';
import { InfoIcon } from '@/components/ui/icon';

type FloatingAlertPosition = 'top' | 'center' | 'bottom';

type FloatingAlertOptions = {
	message: string;
	action?: 'success' | 'error' | 'warning' | 'info' | 'muted';
	variant?: 'solid' | 'outline';
	duration?: number | null;
	icon?: React.ElementType;
	position?: FloatingAlertPosition;
	offset?: number;
	containerClassName?: string;
	alertClassName?: string;
};

type FloatingAlertState = FloatingAlertOptions & {
	duration: number | null;
};

type PositionConfig = {
	containerClass: string;
	containerStyle?: ViewStyle;
};

type Listener = (state: FloatingAlertState | null) => void;

const DEFAULT_DURATION = 3000;
const DEFAULT_POSITION: FloatingAlertPosition = 'bottom';
const DEFAULT_OFFSET = 40;

let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

const notifyListeners = (state: FloatingAlertState | null) => {
	listeners.forEach(listener => listener(state));
};

export const showFloatingAlert = (options: FloatingAlertOptions) => {
	const nextState: FloatingAlertState = {
		action: 'info',
		variant: 'outline',
		position: DEFAULT_POSITION,
		offset: DEFAULT_OFFSET,
		duration: DEFAULT_DURATION,
		...options,
	};

	if (hideTimer) {
		clearTimeout(hideTimer);
		hideTimer = null;
	}

	notifyListeners(nextState);

	if (nextState.duration !== null) {
		hideTimer = setTimeout(() => {
			hideFloatingAlert();
		}, nextState.duration ?? DEFAULT_DURATION);
	}
};

export const hideFloatingAlert = () => {
	if (hideTimer) {
		clearTimeout(hideTimer);
		hideTimer = null;
	}

	notifyListeners(null);
};

const resolvePositionConfig = (
	position: FloatingAlertPosition,
	offset: number,
): PositionConfig => {
	switch (position) {
		case 'top':
			return {
				containerClass: 'absolute left-0 right-0 px-6 items-center',
				containerStyle: { top: offset },
			};
		case 'center':
			return {
				containerClass: 'absolute inset-0 px-6 items-center justify-center',
			};
		case 'bottom':
		default:
			return {
				containerClass: 'absolute left-0 right-0 px-6 items-center',
				containerStyle: { bottom: offset },
			};
	}
};

type FloatingAlertViewProps = {
	state: FloatingAlertState;
};

const FloatingAlertView: React.FC<FloatingAlertViewProps> = ({ state }) => {
	const {
		message,
		action = 'info',
		variant = 'outline',
		icon: IconComponent = InfoIcon,
		position = DEFAULT_POSITION,
		offset = DEFAULT_OFFSET,
		containerClassName,
		alertClassName,
	} = state;

	if (!message) {
		return null;
	}

	const { containerClass, containerStyle } = resolvePositionConfig(position, offset);

	const composedContainerClass = [containerClass, containerClassName]
		.filter(Boolean)
		.join(' ');

	const composedAlertClass = ['w-full max-w-sm', alertClassName]
		.filter(Boolean)
		.join(' ');

	return (
		<View
			pointerEvents="box-none"
			className={composedContainerClass}
			style={containerStyle}
		>
			<Alert
				action={action}
				variant={variant}
				className={composedAlertClass}
				pointerEvents="auto"
			>
				{IconComponent ? <AlertIcon as={IconComponent} /> : null}
				<AlertText>{message}</AlertText>
			</Alert>
		</View>
	);
};

type FloatingAlertViewportProps = {
	defaultPosition?: FloatingAlertPosition;
	defaultOffset?: number;
	containerClassName?: string;
	alertClassName?: string;
};

const FloatingAlertViewport: React.FC<FloatingAlertViewportProps> = ({
	defaultPosition = DEFAULT_POSITION,
	defaultOffset = DEFAULT_OFFSET,
	containerClassName,
	alertClassName,
}) => {
	const [state, setState] = React.useState<FloatingAlertState | null>(null);

	React.useEffect(() => {
		const listener: Listener = nextState => {
			if (!nextState) {
				setState(null);
				return;
			}

			setState({
				...nextState,
				position: nextState.position ?? defaultPosition,
				offset: nextState.offset ?? defaultOffset,
				containerClassName: [containerClassName, nextState.containerClassName]
					.filter(Boolean)
					.join(' ') || undefined,
				alertClassName: [alertClassName, nextState.alertClassName]
					.filter(Boolean)
					.join(' ') || undefined,
			});
		};

		listeners.add(listener);

		return () => {
			listeners.delete(listener);
		};
	}, [defaultOffset, defaultPosition, containerClassName, alertClassName]);

	if (!state) {
		return null;
	}

	return <FloatingAlertView state={state} />;
};

export { FloatingAlertViewport };
export type { FloatingAlertOptions };
export default FloatingAlertViewport;
