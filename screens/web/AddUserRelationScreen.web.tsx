import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from '@/components/ui/image';
import { Button, ButtonText } from '@/components/ui/button';
import Navigator from '@/components/uiverse/navigation/navigator';
import WebScreenHero from '@/components/uiverse/navigation/web-screen-hero';
import UserRelationshipsForm from '@/components/uiverse/users/user-relationships-form';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { ScreenDismissKeyboard } from '@/components/uiverse/shared/screen-dismiss-keyboard';
import { LUMUS_CLASS_NAMES as ui } from '@/design-system/tokens';
import { cn } from '@/lib/utils';
import { APP_ROUTE_PATHS, navigateBackOrRoute, replaceToRoute } from '@/utils/navigation';
import Wallpaper from '@/assets/Background/wallpaper01.png';
import Illustration from '@/assets/UnDraw/addUserRelationScreen.svg';

export default function AddUserRelationScreen() {
  const { fromProfile } = useLocalSearchParams<{ fromProfile?: string }>();
  const { isDarkMode, heroHeight, insets, webDashboardClassNames: layout } = useScreenStyles();
  const inputRef = React.useRef<TextInput>(null);
  const getInputRef = React.useCallback(() => inputRef, []);
  const keyboard = useKeyboardAwareScroll<'related-user-id'>({ getInputRef });
  const back = React.useCallback(() => {
    if (fromProfile === '1') navigateBackOrRoute(APP_ROUTE_PATHS.profile);
    else replaceToRoute(APP_ROUTE_PATHS.profile);
    return true;
  }, [fromProfile]);
  return <ScreenDismissKeyboard>
    <SafeAreaView className={cn(ui.screen, 'web:w-screen')} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="relative flex-1">
        <View className="absolute left-0 right-0 top-0 overflow-hidden rounded-b-3xl" style={{ height: heroHeight }}>
          <Image source={Wallpaper} alt="Fundo da tela de vínculos" className="absolute h-full w-full rounded-b-3xl" resizeMode="cover" />
          <WebScreenHero title="Vincular usuário" Illustration={Illustration} isDarkMode={isDarkMode} topPadding={insets.top + 24} />
        </View>
        <ScrollView ref={keyboard.scrollViewRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          className={cn(ui.screen, layout.sheet, 'relative z-sheet flex-1 rounded-t-sheet')} style={{ marginTop: heroHeight - 64 }}
          contentContainerStyle={{ paddingBottom: keyboard.contentBottomPadding }}
          onScroll={keyboard.handleScroll} scrollEventThrottle={keyboard.scrollEventThrottle}>
          <View className={cn(layout.contentFrame, layout.contentPadding, 'pt-5')}>
            <Button variant="outline" onPress={back} className={cn(ui.secondaryButton, ui.focusRing, 'mb-5 min-h-12')}><ButtonText className={ui.body}>Voltar ao perfil</ButtonText></Button>
            <UserRelationshipsForm inputRef={inputRef} onInputFocus={() => keyboard.handleInputFocus('related-user-id')} dismissKeyboard={Keyboard.dismiss} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Navigator defaultValue={2} onHardwareBack={back} />
    </SafeAreaView>
  </ScreenDismissKeyboard>;
}
