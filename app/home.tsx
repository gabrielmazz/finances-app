import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { Menu } from '@/components/uiverse/menu';

import HomeScreen from '@/screens/HomeScreen';
import AddRegisterExpensesScreen from '@/screens/AddRegisterExpensesScreen';
import ConfigurationsScreen from '@/screens/ConfigurationsScreen';
import { useAppTheme } from '@/contexts/ThemeContext';

const TAB_ITEMS = [
	{
		key: 'home',
		component: HomeScreen,
	},
	{
		key: 'control',
		component: AddRegisterExpensesScreen,
	},
	{
		key: 'configurations',
		component: ConfigurationsScreen,
	},
] as const;

export default function HomeRoute() {
	const { isDarkMode } = useAppTheme();
	const { tab } = useLocalSearchParams<{ tab?: string }>();
	const tabCount = TAB_ITEMS.length;
	const pageBackground = useMemo(() => (isDarkMode ? '#0b1220' : '#f4f5f7'), [isDarkMode]);

	const parsedTabFromParams = useMemo(() => {
		const parsed = Number(tab);
		if (Number.isFinite(parsed)) {
			return Math.min(Math.max(Math.trunc(parsed), 0), tabCount - 1);
		}
		return 0;
	}, [tab, tabCount]);

	const [activeTab, setActiveTab] = useState(parsedTabFromParams);
	const normalizedIndex = Math.min(Math.max(activeTab, 0), tabCount - 1);
	const ActiveComponent =
		TAB_ITEMS[normalizedIndex]?.component ?? TAB_ITEMS[0].component;

	useEffect(() => {
		setActiveTab(parsedTabFromParams);
	}, [parsedTabFromParams]);

	return (
		<SafeAreaView
			className="flex-1"
			edges={['top', 'bottom', 'left', 'right']}
			style={{ backgroundColor: pageBackground }}
		>
			<View
				className="
					flex-1 w-full h-full
					justify-between
					pb-2
					relative
				"
				style={{ backgroundColor: pageBackground }}
			>
				<View className="flex-1">
					<ActiveComponent />
				</View>

				<View className="items-center">
					<Menu
						defaultValue={normalizedIndex}
						onChange={value => {
							setActiveTab(value);
							router.replace({ pathname: '/home', params: { tab: String(value) } });
						}}
					/>
				</View>
			</View>
		</SafeAreaView>
	);
}
