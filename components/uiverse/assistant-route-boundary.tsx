import React from 'react';
import { SafeAreaView, Text, View } from 'react-native';

import { useScreenStyles } from '@/hooks/useScreenStyle';

const AssistantRouteFailure = () => {
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
				<Text className={`text-center text-xl font-bold ${headingText}`}>
					Não foi possível abrir o Lumus IA
				</Text>
				<Text className={`text-center text-sm leading-5 ${bodyText}`}>
					Atualize ou reinstale o aplicativo e tente novamente. As demais áreas do Lumus continuam disponíveis.
				</Text>
			</View>
		</SafeAreaView>
	);
};

type AssistantRouteBoundaryState = { failed: boolean };

// [[Assistente Lumus]]: recuperação de erro inesperado da tela, sem bloquear a entrada normal da rota.
export class AssistantRouteBoundary extends React.Component<
	React.PropsWithChildren,
	AssistantRouteBoundaryState
> {
	state: AssistantRouteBoundaryState = { failed: false };

	static getDerivedStateFromError(): AssistantRouteBoundaryState {
		return { failed: true };
	}

	componentDidCatch(error: unknown) {
		console.error('Não foi possível renderizar o Assistente Lumus:', error);
	}

	render() {
		return this.state.failed ? <AssistantRouteFailure /> : this.props.children;
	}
}
