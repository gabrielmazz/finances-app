import { useState } from 'react';
import { SafeAreaView, View } from 'react-native';

// Importação de componentes externos
import { Menu } from '@/components/uiverse/menu';

// Telas individuais
import HomeScreen from './HomeScreen';
import AddExpensesScreen from './AddExpensesScreen';
import ComingSoonScreen from './ConfigurationsScreen';

const TAB_ITEMS = [
	{
		key: 'home',
		label: 'Home',
		component: HomeScreen,
	},
	{
		key: 'add-expense',
		label: 'Adicionar Despesa',
		component: AddExpensesScreen,
	},
	{
		key: 'coming-soon',
		label: 'Em breve',
		component: ComingSoonScreen,
	},
] as const;

export default function MainTabsScreen() {
	const [activeTab, setActiveTab] = useState(0);
	const tabCount = TAB_ITEMS.length;
	const normalizedIndex = Math.min(Math.max(activeTab, 0), tabCount - 1);
	const ActiveComponent = TAB_ITEMS[normalizedIndex]?.component ?? TAB_ITEMS[0].component;

	return (
		<SafeAreaView className="flex-1">
			<View
				className="
					flex-1
					justify-between
					px-4
					pb-6
				"
			>
				<View className="flex-1">
					<ActiveComponent />
				</View>

				<View className="items-center">
					<Menu
						labels={TAB_ITEMS.map(tab => tab.label)}
						defaultIndex={normalizedIndex}
						onChange={(index) => setActiveTab(index)}
					/>
				</View>
			</View>
		</SafeAreaView>
	);
}
