import React from 'react';
import { createPortal } from 'react-dom';
import { Pressable, Text, View } from 'react-native';

import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icon';
import { LUMUS_OVERLAY_Z_INDEX } from '@/design-system/tokens';
import { useScreenStyles } from '@/hooks/useScreenStyle';

const WEB_SELECT_MENU_MAX_HEIGHT = 288;
const WEB_SELECT_MENU_VIEWPORT_GAP = 12;

export type WebSelectOption = {
	value: string;
	label: string;
	disabled?: boolean;
};

type WebSelectFieldProps = {
	options: readonly WebSelectOption[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	isDisabled?: boolean;
	accessibilityLabel: string;
};

type WebPressableProps = React.ComponentProps<typeof Pressable> & {
	onKeyDown?: (event: unknown) => void;
};

type DropdownPosition = {
	top: number;
	left: number;
	width: number;
	maxHeight: number;
};

const WebPressable = React.forwardRef<React.ComponentRef<typeof Pressable>, WebPressableProps>(
	(props, ref) => <Pressable {...props} ref={ref} />,
);
WebPressable.displayName = 'WebSelectPressable';

export default function WebSelectField({
	options,
	value,
	onChange,
	placeholder = 'Escolha uma opção…',
	isDisabled = false,
	accessibilityLabel,
}: WebSelectFieldProps) {
	const { webSelectClassNames } = useScreenStyles();
	const [isOpen, setIsOpen] = React.useState(false);
	const [menuPosition, setMenuPosition] = React.useState<DropdownPosition | null>(null);
	const triggerRef = React.useRef<React.ComponentRef<typeof Pressable> | null>(null);
	const menuRef = React.useRef<HTMLDivElement | null>(null);
	const selectedOption = options.find(option => option.value === value);

	React.useEffect(() => {
		if (!isOpen) return;
		const dismissOutside = (event: PointerEvent) => {
			const trigger = triggerRef.current as unknown as HTMLElement | null;
			const target = event.target as Node;
			if (!trigger?.contains(target) && !menuRef.current?.contains(target)) setIsOpen(false);
		};
		const dismissWithKeyboard = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			event.stopPropagation();
			setIsOpen(false);
			(triggerRef.current as unknown as HTMLElement | null)?.focus();
		};
		document.addEventListener('pointerdown', dismissOutside);
		document.addEventListener('keydown', dismissWithKeyboard, true);
		return () => {
			document.removeEventListener('pointerdown', dismissOutside);
			document.removeEventListener('keydown', dismissWithKeyboard, true);
		};
	}, [isOpen]);

	React.useEffect(() => {
		if (isDisabled) {
			setIsOpen(false);
		}
	}, [isDisabled]);

	const updateMenuPosition = React.useCallback(() => {
		if (typeof window === 'undefined') {
			return;
		}

		const triggerElement = triggerRef.current as unknown as HTMLElement | null;
		if (!triggerElement) {
			return;
		}

		const bounds = triggerElement.getBoundingClientRect();
		// [[Auditoria de Design]]: o teclado/zoom podem reduzir a viewport visual.
		const viewport = window.visualViewport;
		const viewportTop = viewport?.offsetTop ?? 0;
		const viewportLeft = viewport?.offsetLeft ?? 0;
		const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
		const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
		const below = Math.max(0, viewportBottom - bounds.bottom - WEB_SELECT_MENU_VIEWPORT_GAP);
		const above = Math.max(0, bounds.top - viewportTop - WEB_SELECT_MENU_VIEWPORT_GAP);
		const opensAbove = below < WEB_SELECT_MENU_MAX_HEIGHT && above > below;
		const maxHeight = Math.min(WEB_SELECT_MENU_MAX_HEIGHT, opensAbove ? above : below);
		const width = Math.min(bounds.width, Math.max(0, viewportRight - viewportLeft - 2 * WEB_SELECT_MENU_VIEWPORT_GAP));
		setMenuPosition({
			top: Math.round(opensAbove ? bounds.top - maxHeight - 4 : bounds.bottom + 4),
			left: Math.round(Math.max(viewportLeft + WEB_SELECT_MENU_VIEWPORT_GAP, Math.min(bounds.left, viewportRight - width - WEB_SELECT_MENU_VIEWPORT_GAP))),
			width: Math.round(width),
			maxHeight: Math.floor(maxHeight),
		});
	}, []);

	React.useEffect(() => {
		if (!isOpen || typeof window === 'undefined') {
			setMenuPosition(null);
			return;
		}

		updateMenuPosition();
		window.addEventListener('resize', updateMenuPosition);
		window.addEventListener('scroll', updateMenuPosition, true);
		window.visualViewport?.addEventListener('resize', updateMenuPosition);
		window.visualViewport?.addEventListener('scroll', updateMenuPosition);
		return () => {
			window.removeEventListener('resize', updateMenuPosition);
			window.removeEventListener('scroll', updateMenuPosition, true);
			window.visualViewport?.removeEventListener('resize', updateMenuPosition);
			window.visualViewport?.removeEventListener('scroll', updateMenuPosition);
		};
	}, [isOpen, updateMenuPosition]);

	const handleTriggerKeyDown = (event: unknown) => {
		const keyboardEvent = event as { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void };
		const key = keyboardEvent.key ?? keyboardEvent.nativeEvent?.key;
		if (key === 'Enter' || key === ' ') {
			keyboardEvent.preventDefault?.();
			setIsOpen(current => !current);
		} else if (key === 'Escape') {
			setIsOpen(false);
		}
	};

	// O portal fora do ScrollView evita que stacking contexts ou áreas roláveis cubram o menu.
	const menu = isOpen && menuPosition && typeof document !== 'undefined'
		? createPortal(
				<div
					ref={menuRef}
					style={{
						position: 'fixed',
						top: menuPosition.top,
						left: menuPosition.left,
						width: menuPosition.width,
						maxHeight: menuPosition.maxHeight,
						overflowY: 'auto',
						zIndex: LUMUS_OVERLAY_Z_INDEX.webDropdown,
					}}
				>
					<View className={webSelectClassNames.menu}>
						{options.map(option => {
							const isSelected = option.value === value;
							return (
								<WebPressable
									key={option.value}
									onPress={() => {
										if (option.disabled) {
											return;
										}
										onChange(option.value);
										setIsOpen(false);
									}}
									disabled={option.disabled}
									accessibilityRole="button"
									accessibilityLabel={option.label}
									accessibilityState={{ disabled: option.disabled, selected: isSelected }}
									className={`${webSelectClassNames.option} ${isSelected ? webSelectClassNames.optionSelected : ''} ${option.disabled ? webSelectClassNames.optionDisabled : ''}`}
								>
									<Text className={webSelectClassNames.optionText}>{option.label}</Text>
								</WebPressable>
							);
						})}
					</View>
				</div>,
				document.body,
			)
		: null;

	return (
		<View className="w-full">
			<WebPressable
				ref={triggerRef}
				onPress={() => !isDisabled && setIsOpen(current => !current)}
				onKeyDown={handleTriggerKeyDown}
				disabled={isDisabled}
				accessibilityRole="combobox"
				accessibilityLabel={accessibilityLabel}
				accessibilityState={{ disabled: isDisabled, expanded: isOpen }}
				className={`${webSelectClassNames.trigger} ${isDisabled ? 'opacity-40' : ''}`}
			>
				<Text className={selectedOption ? webSelectClassNames.value : webSelectClassNames.placeholder} numberOfLines={1}>
					{selectedOption?.label ?? placeholder}
				</Text>
				{isOpen ? (
					<ChevronUpIcon className={webSelectClassNames.icon} aria-hidden />
				) : (
					<ChevronDownIcon className={webSelectClassNames.icon} aria-hidden />
				)}
			</WebPressable>
			{menu}
		</View>
	);
}
