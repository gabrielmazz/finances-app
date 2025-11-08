import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { signOut } from 'firebase/auth';

import { HStack } from '@/components/ui/hstack';
import { Button, ButtonText } from '@/components/ui/button';
import { Menu as GluestackMenu, MenuItem, MenuItemLabel } from '@/components/ui/menu';
import { auth } from '@/FirebaseConfig';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type MenuOption = {
	label: string;
	value?: number;
	onSelect?: () => void;
};

const styles = StyleSheet.create({
	wrapper: {
		width: '100%',
		position: 'relative',
	},
	absoluteContainer: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
	},
	buttonWrapper: {
		flexShrink: 0,
	},
	edgeLeftMargin: {
		marginLeft: 0,
	},
	edgeRightMargin: {
		marginRight: 0,
	},
});

export type MenuGroup = {
	triggerLabel: string;
	options: MenuOption[];
};

export type MenuProps = {
	groups?: MenuGroup[];
	defaultIndex?: number;
	defaultValue?: number;
	onChange?: (value: number, label: string) => void;
};

const logoutUser = async () => {
	try {
		await signOut(auth);
		router.replace('/');
	} catch (error) {
		console.error('Erro ao deslogar usuário:', error);
		Alert.alert('Erro ao deslogar', 'Não foi possível encerrar a sessão. Tente novamente.');
	}
};

const buildDefaultGroups = (): MenuGroup[] => [
	{
		triggerLabel: 'Home',
		options: [
			{
				label: 'Home',
				value: 0,
				onSelect: () => router.replace('/home?tab=0'),
			},
		],
	},
	{
		triggerLabel: 'Controle',
		options: [
			{
				label: 'Registrar Despesa',
				value: 1,
				onSelect: () => router.push('/add-register-expenses'),
			},
			{
				label: 'Registrar Ganho',
				value: 1,
				onSelect: () => router.push('/add-register-gain'),
			},
			{
				label: 'Registrar saldo mensal',
				value: 1,
				onSelect: () => router.push('/register-monthly-balance'),
			},
		],
	},
	{
		triggerLabel: 'Configurações',
		options: [
			{
				label: 'Configurações',
				value: 2,
				onSelect: () => router.replace('/home?tab=2'),
			},
			{
				label: 'Sair',
				onSelect: () => {
					void logoutUser();
				},
			},
		],
	},
];

const resolveAvailableValues = (groups: MenuGroup[]) =>
	groups
		.flatMap(group => group.options)
		.filter(option => typeof option.value === 'number')
		.map(option => option.value as number);

export const Menu: React.FC<MenuProps> = ({
	groups,
	defaultIndex,
	defaultValue,
	onChange,
}) => {
	const insets = useSafeAreaInsets();
	const resolvedGroups = useMemo(
		() => (groups && groups.length > 0 ? groups : buildDefaultGroups()),
		[groups],
	);

	const availableValues = useMemo(
		() => resolveAvailableValues(resolvedGroups),
		[resolvedGroups],
	);

	const incomingDefault = defaultValue ?? defaultIndex;
	const normalizedDefault = useMemo(() => {
		if (typeof incomingDefault === 'number' && availableValues.includes(incomingDefault)) {
			return incomingDefault;
		}
		return availableValues[0] ?? 0;
	}, [availableValues, incomingDefault]);

	const [activeValue, setActiveValue] = useState<number>(normalizedDefault);
	const [containerHeight, setContainerHeight] = useState(0);

	useEffect(() => {
		setActiveValue(prev => {
			if (availableValues.length === 0) {
				return prev;
			}
			return availableValues.includes(prev) ? prev : availableValues[0];
		});
	}, [availableValues]);

	useEffect(() => {
		setActiveValue(normalizedDefault);
	}, [normalizedDefault]);

	useEffect(() => {
		const handleBackPress = () => {
			if (router) {
				router.replace('/home?tab=0');
				return true;
			}
			return false;
		};

		const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);

		return () => {
			backHandler.remove();
		};
	}, []);

	const handleSelect = useCallback(
		(option: MenuOption) => {
			if (typeof option.value === 'number') {
				setActiveValue(option.value);
				onChange?.(option.value, option.label);
			}
			option.onSelect?.();
		},
		[onChange],
	);

	const activeGroupIndex = useMemo(
		() =>
			resolvedGroups.findIndex(group =>
				group.options.some(option => option.value === activeValue),
			),
		[resolvedGroups, activeValue],
	);

	const effectiveBottomPadding = Math.max(insets.bottom, 16);

	const handleContainerLayout = useCallback(
		(event: LayoutChangeEvent) => {
			const {
				nativeEvent: {
					layout: { height },
				},
			} = event;

			setContainerHeight(prev => {
				if (Math.abs(prev - height) < 1) {
					return prev;
				}
				return height;
			});
		},
		[],
	);

	if (resolvedGroups.length === 0) {
		return null;
	}

	return (
		<View style={styles.wrapper} pointerEvents="box-none">
			<View style={{ height: containerHeight }} />

			<View
				className="items-center"
				style={[
					styles.absoluteContainer,
					{
						paddingHorizontal: 24,
						paddingTop: 12,
						paddingBottom: effectiveBottomPadding,
					},
				]}
				onLayout={handleContainerLayout}
			>
				<HStack space="md" className="w-full justify-center">
					{resolvedGroups.map((group, groupIndex) => {
						if (group.options.length === 0) {
							return null;
						}

						const isActiveGroup = groupIndex === activeGroupIndex;
						const isFirst = groupIndex === 0;
						const isLast = groupIndex === resolvedGroups.length - 1;

						return (
							<View
								key={group.triggerLabel}
								style={[
									styles.buttonWrapper,
									isFirst && styles.edgeLeftMargin,
									isLast && styles.edgeRightMargin,
								]}
							>
								<GluestackMenu
									placement="top"
									closeOnSelect
									trigger={triggerProps => (
										<Button
											{...triggerProps}
											size="sm"
											variant={isActiveGroup ? 'solid' : 'outline'}
											action="secondary"
											className="min-w-[120px]"
										>
											<ButtonText>{group.triggerLabel}</ButtonText>
										</Button>
									)}
								>
									{group.options.map(option => (
										<MenuItem
											key={`${group.triggerLabel}-${option.label}`}
											onPress={() => handleSelect(option)}
											textValue={option.label}
										>
											<MenuItemLabel bold={option.value === activeValue}>
												{option.label}
											</MenuItemLabel>
										</MenuItem>
									))}
								</GluestackMenu>
							</View>
						);
					})}
				</HStack>
			</View>
		</View>
	);
};
