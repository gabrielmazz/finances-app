import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'nativewind';

type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
	themeMode: ThemeMode;
	isDarkMode: boolean;
	isLoadingTheme: boolean;
	setThemeMode: (mode: ThemeMode) => void;
	toggleThemeMode: () => void;
};

const STORAGE_KEY = '@finances/theme-mode';

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
	const { colorScheme, setColorScheme } = useColorScheme();
	const [themeMode, setThemeModeState] = React.useState<ThemeMode>('light');
	const [isLoadingTheme, setIsLoadingTheme] = React.useState(true);
	const hasHydratedTheme = React.useRef(false);
	const initialColorScheme = React.useRef<ThemeMode>(colorScheme === 'dark' ? 'dark' : 'light');

	const persistThemeMode = React.useCallback(async (mode: ThemeMode) => {
		try {
			await AsyncStorage.setItem(STORAGE_KEY, mode);
		} catch (error) {
			console.error('Erro ao salvar preferência de tema:', error);
		}
	}, []);

	const applyThemeMode = React.useCallback(
		(mode: ThemeMode) => {
			setThemeModeState(mode);
			setColorScheme(mode);
			void persistThemeMode(mode);
		},
		[persistThemeMode, setColorScheme],
	);

	const toggleThemeMode = React.useCallback(() => {
		setThemeModeState(previousMode => {
			const nextMode: ThemeMode = previousMode === 'dark' ? 'light' : 'dark';
			setColorScheme(nextMode);
			void persistThemeMode(nextMode);
			return nextMode;
		});
	}, [persistThemeMode, setColorScheme]);

	React.useEffect(() => {
		if (hasHydratedTheme.current) {
			return;
		}

		hasHydratedTheme.current = true;

		let isMounted = true;

		const loadThemePreference = async () => {
			try {
				const storedValue = await AsyncStorage.getItem(STORAGE_KEY);
				if (!isMounted) {
					return;
				}

				const parsedMode: ThemeMode =
					storedValue === 'dark' || storedValue === 'light'
						? storedValue
						: initialColorScheme.current;

				applyThemeMode(parsedMode);
			} catch (error) {
				console.error('Erro ao carregar preferência de tema:', error);
				if (isMounted) {
					applyThemeMode(initialColorScheme.current);
				}
			} finally {
				if (isMounted) {
					setIsLoadingTheme(false);
				}
			}
		};

		void loadThemePreference();

		return () => {
			isMounted = false;
		};
	}, [applyThemeMode]);

	const contextValue = React.useMemo<ThemeContextValue>(
		() => ({
			themeMode,
			isDarkMode: themeMode === 'dark',
			isLoadingTheme,
			setThemeMode: applyThemeMode,
			toggleThemeMode,
		}),
		[themeMode, isLoadingTheme, applyThemeMode, toggleThemeMode],
	);

	return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => {
	const context = React.useContext(ThemeContext);
	if (!context) {
		throw new Error('useAppTheme deve ser utilizado dentro de um ThemeProvider.');
	}

	return context;
};
