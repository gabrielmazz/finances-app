import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ValueVisibilityContextValue = {
	shouldHideValues: boolean;
	setShouldHideValues: (value: boolean) => void;
	toggleShouldHideValues: () => void;
	isLoadingPreference: boolean;
};

const STORAGE_KEY = '@finances/value-visibility';
const HIDDEN_PLACEHOLDER = '••••';

const ValueVisibilityContext = React.createContext<ValueVisibilityContextValue | undefined>(undefined);

export const ValueVisibilityProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
	const [shouldHideValues, updateShouldHideValues] = React.useState(false);
	const [isLoadingPreference, setIsLoadingPreference] = React.useState(true);

	const persistPreference = React.useCallback(async (value: boolean) => {
		try {
			await AsyncStorage.setItem(STORAGE_KEY, value ? 'hidden' : 'visible');
		} catch (error) {
			console.error('Erro ao salvar preferência de visibilidade dos valores:', error);
		}
	}, []);

	const setShouldHideValues = React.useCallback(
		(value: boolean) => {
			updateShouldHideValues(value);
			void persistPreference(value);
		},
		[persistPreference],
	);

	const toggleShouldHideValues = React.useCallback(() => {
		updateShouldHideValues(previous => {
			const nextValue = !previous;
			void persistPreference(nextValue);
			return nextValue;
		});
	}, [persistPreference]);

	React.useEffect(() => {
		let isMounted = true;

		const loadPreference = async () => {
			try {
				const storedValue = await AsyncStorage.getItem(STORAGE_KEY);
				if (!isMounted) {
					return;
				}

				updateShouldHideValues(storedValue === 'hidden');
			} catch (error) {
				console.error('Erro ao carregar preferência de visibilidade dos valores:', error);
			} finally {
				if (isMounted) {
					setIsLoadingPreference(false);
				}
			}
		};

		void loadPreference();

		return () => {
			isMounted = false;
		};
	}, []);

	const contextValue = React.useMemo<ValueVisibilityContextValue>(
		() => ({
			shouldHideValues,
			setShouldHideValues,
			toggleShouldHideValues,
			isLoadingPreference,
		}),
		[shouldHideValues, setShouldHideValues, toggleShouldHideValues, isLoadingPreference],
	);

	return <ValueVisibilityContext.Provider value={contextValue}>{children}</ValueVisibilityContext.Provider>;
};

export const useValueVisibility = () => {
	const context = React.useContext(ValueVisibilityContext);
	if (!context) {
		throw new Error('useValueVisibility deve ser utilizado dentro de um ValueVisibilityProvider.');
	}
	return context;
};

export const HIDDEN_VALUE_PLACEHOLDER = HIDDEN_PLACEHOLDER;
