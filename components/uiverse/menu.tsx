import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { router } from 'expo-router';

import { HStack } from '@/components/ui/hstack';
import { Button, ButtonText } from '@/components/ui/button';
import { Menu as GluestackMenu, MenuItem, MenuItemLabel } from '@/components/ui/menu';

export type MenuOption = {
	label: string;
	value?: number;
	onSelect?: () => void;
};

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
				label: 'Adicionar Despesa',
				value: 1,
				onSelect: () => router.replace('/home?tab=1'),
			},
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
				label: 'Registrar Usuário',
				value: 2,
				onSelect: () => router.push('/add-register-user'),
			},
			{
				label: 'Registrar Banco',
				value: 2,
				onSelect: () => router.push('/add-register-bank'),
			},
			{
				label: 'Registrar Tag',
				value: 2,
				onSelect: () => router.push('/add-register-tag'),
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

	if (resolvedGroups.length === 0) {
		return null;
	}

	return (
		<View className="w-full items-center py-4 px-6">
			<HStack space="md" className="w-full justify-center">
				{resolvedGroups.map((group, groupIndex) => {
					if (group.options.length === 0) {
						return null;
					}

					const isActiveGroup = groupIndex === activeGroupIndex;

					return (
						<GluestackMenu
							placement="top"
							key={group.triggerLabel}
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
								>
									<MenuItemLabel bold={option.value === activeValue}>
										{option.label}
									</MenuItemLabel>
								</MenuItem>
							))}
						</GluestackMenu>
					);
				})}
			</HStack>
		</View>
	);
};
