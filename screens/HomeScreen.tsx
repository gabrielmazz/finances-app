import React from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

// Importações relacionadas ao Gluestack UI
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';


export default function HomeScreen() {
	// Lista com todos os bancos que serão vindos do configurador
	useFocusEffect(
		React.useCallback(() => {
			// Ao integrar com a API, este callback deve buscar novamente os dados mais recentes.
			return () => {
				// Limpeza quando necessário.
			};
		}, []),
	);

	return (
		<View className="gap-4">
			{/* Componentes que mostrara quando cada banco possui saldo,
				como não tera interação com API, tera que adicionar manualmente
				os valores no configurador dos bancos
			*/}

			{/* Ban */}
			<Card>
				<Heading>Banco A</Heading>
				<Text>Saldo: R$ 1.000,00</Text>
			</Card>
			<Card>
				<Heading>Banco B</Heading>
				<Text>Saldo: R$ 500,00</Text>
			</Card>
			<Card>
				<Heading>Banco C</Heading>
				<Text>Saldo: R$ 2.000,00</Text>
			</Card>
		</View>
	);
}
