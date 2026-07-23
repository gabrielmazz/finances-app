import React from 'react';
import { ActivityIndicator, SafeAreaView, Text, View } from 'react-native';

import { useScreenStyles } from '@/hooks/useScreenStyle';

const AssistantRouteStatus = ({ failed = false }: { failed?: boolean }) => {
	const { surfaceBackground, headingText, bodyText } = useScreenStyles();

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: surfaceBackground }}>
			<View
				style={{
					flex: 1,
					alignItems: 'center',
					justifyContent: 'center',
					paddingHorizontal: 28,
					gap: 12,
				}}
			>
				{failed ? null : <ActivityIndicator size="large" color="#eab308" />}
				<Text className={`text-center text-xl font-bold ${headingText}`}>
					{failed ? 'Este build precisa ser atualizado' : 'Carregando recursos do Lumus'}
				</Text>
				{failed ? (
					<Text className={`text-center text-sm leading-5 ${bodyText}`}>
						Os módulos nativos do assistente não existem nesta instalação. Volte para a tela anterior e instale um development build novo; as demais áreas do aplicativo continuam disponíveis.
					</Text>
				) : null}
			</View>
		</SafeAreaView>
	);
};

type AssistantRouteBoundaryState = { failed: boolean };

// [[Assistente Lumus]]: o Expo Router avalia arquivos de rota no bootstrap.
// A boundary segura mantém módulos nativos novos fora da abertura da Login.
export class AssistantRouteBoundary extends React.Component<
	React.PropsWithChildren,
	AssistantRouteBoundaryState
> {
	state: AssistantRouteBoundaryState = { failed: false };

	static getDerivedStateFromError(): AssistantRouteBoundaryState {
		return { failed: true };
	}

	componentDidCatch(error: unknown) {
		console.error('Não foi possível carregar os módulos nativos do Assistente Lumus:', error);
	}

	render() {
		return this.state.failed ? <AssistantRouteStatus failed /> : this.props.children;
	}
}

export const AssistantRouteLoading = () => <AssistantRouteStatus />;
