import React from 'react';
import {
	BackHandler,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	TextInput,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Box } from '@/components/ui/box';
import { Image } from '@/components/ui/image';
import BankBalanceAdjustmentForm from '@/components/uiverse/banks/bank-balance-adjustment-form';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import Navigator from '@/components/uiverse/navigation/navigator';
import { useBankBalanceAdjustmentForm } from '@/hooks/useBankBalanceAdjustmentForm';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { useAppTheme } from '@/contexts/ThemeContext';
import { LUMUS_CLASS_NAMES, LUMUS_LAYOUT_TOKENS } from '@/design-system/tokens';
import Wallpaper from '@/assets/Background/wallpaper01.png';
import AdjustmentIllustration from '@/assets/UnDraw/bankBalanceAdjustmentScreen.svg';

export default function BankBalanceAdjustmentScreen() {
	const form = useBankBalanceAdjustmentForm();
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height } = useWindowDimensions();
	const heroHeight =
		Math.max(
			LUMUS_LAYOUT_TOKENS.heroMinimumHeight,
			height * LUMUS_LAYOUT_TOKENS.heroViewportRatio,
		) + insets.top;
	const valueRef = React.useRef<TextInput | null>(null);
	const descriptionRef = React.useRef<TextInput | null>(null);
	const getInputRef = React.useCallback(
		(key: 'value' | 'description') =>
			key === 'value' ? valueRef : descriptionRef,
		[],
	);
	const scroll = useKeyboardAwareScroll({ getInputRef });
	useFocusEffect(
		React.useCallback(() => {
			const subscription = BackHandler.addEventListener(
				'hardwareBackPress',
				() => {
					if (!form.submitting) form.back();
					return true;
				},
			);

			return () => subscription.remove();
		}, [form.back, form.submitting]),
	);

	return (
		<SafeAreaView
			className={LUMUS_CLASS_NAMES.screen}
			edges={['left', 'right', 'bottom']}
		>
			<StatusBar
				barStyle={isDarkMode ? 'light-content' : 'dark-content'}
				backgroundColor="transparent"
				translucent
			/>
			<KeyboardAvoidingView
				className="flex-1"
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			>
				<Box
					className="absolute inset-x-0 top-0"
					style={{ height: heroHeight }}
				>
					<Image
						source={Wallpaper}
						alt=""
						className="absolute h-full w-full rounded-b-3xl"
						resizeMode="cover"
					/>
					<WebScreenHero
						title={
							form.adjustmentId
								? 'Editar ajuste de saldo'
								: 'Ajuste de saldo'
						}
						Illustration={AdjustmentIllustration}
						isDarkMode={isDarkMode}
						topPadding={insets.top + 24}
					/>
				</Box>
				<ScrollView
					ref={scroll.scrollViewRef}
					className={`flex-1 rounded-t-sheet ${LUMUS_CLASS_NAMES.surfaceFill}`}
					style={{ marginTop: heroHeight - 64 }}
					contentContainerStyle={{
						paddingBottom: scroll.contentBottomPadding,
					}}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					onScroll={scroll.handleScroll}
					scrollEventThrottle={scroll.scrollEventThrottle}
				>
					<Box className="px-6 pt-6">
						<BankBalanceAdjustmentForm
							form={form}
							valueRef={valueRef}
							descriptionRef={descriptionRef}
							onFocus={scroll.handleInputFocus}
						/>
					</Box>
				</ScrollView>
			</KeyboardAvoidingView>
			<Navigator defaultValue={2} />
		</SafeAreaView>
	);
}
