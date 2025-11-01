import { View } from 'react-native';

// Importações relacionadas ao Gluestack UI
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';

// Importações relacionadas ao Firebase
import { auth } from '@/FirebaseConfig';
import { getAuth } from 'firebase/auth';

export default function HomeScreen() {
	// Lista com todos os bancos que serão vindos do configurador

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
