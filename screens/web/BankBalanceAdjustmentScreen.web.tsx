import React from 'react';
import { Image, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@/components/ui/box';
import BankBalanceAdjustmentForm from '@/components/uiverse/banks/bank-balance-adjustment-form';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import Navigator from '@/components/uiverse/navigation/navigator';
import { useBankBalanceAdjustmentForm } from '@/hooks/useBankBalanceAdjustmentForm';
import { useAppTheme } from '@/contexts/ThemeContext';
import { LUMUS_CLASS_NAMES, LUMUS_LAYOUT_TOKENS } from '@/design-system/tokens';
import { WEB_DASHBOARD_CLASS_NAMES } from '@/design-system/web-dashboard';
import { BANK_ADJUSTMENT_HERO_IMAGE_STYLE } from '@/design-system/native-styles';
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

	return (
		<Box className={`${LUMUS_CLASS_NAMES.screen} w-screen`}>
			<ScrollView
				className="flex-1"
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<Box
					className={WEB_DASHBOARD_CLASS_NAMES.hero}
					style={{ height: heroHeight }}
				>
					<Image
						source={Wallpaper}
						resizeMode="cover"
						className={WEB_DASHBOARD_CLASS_NAMES.heroImage}
						style={BANK_ADJUSTMENT_HERO_IMAGE_STYLE}
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
				<Box
					className={`relative z-sheet rounded-t-sheet pb-12 pt-7 ${LUMUS_CLASS_NAMES.surfaceFill}`}
					style={{ marginTop: heroHeight - 64 }}
				>
					<Box
						className={`${WEB_DASHBOARD_CLASS_NAMES.contentFrame} ${WEB_DASHBOARD_CLASS_NAMES.contentPadding}`}
					>
						<BankBalanceAdjustmentForm form={form} />
					</Box>
				</Box>
			</ScrollView>
			<Navigator defaultValue={2} />
		</Box>
	);
}
