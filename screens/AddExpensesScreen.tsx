import { View } from 'react-native';


// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import {
	Select,
	SelectTrigger,
	SelectInput,
	SelectIcon,
	SelectPortal,
	SelectBackdrop,
	SelectContent,
	SelectDragIndicator,
	SelectDragIndicatorWrapper,
	SelectItem,
} from '@/components/ui/select';

export default function AddExpensesScreen() {

	const expensesCategoriesBanks = [

		

	];


	return (

		<View
			className="
				mt-[64px]
			"
		>

			<Heading
				size="3xl"
				className="text-center"
			>
				Adicionar Despesa
			</Heading>


			<Select>
				<SelectTrigger variant="outline" size="md">
					<SelectInput placeholder="Select option" />
				</SelectTrigger>
				<SelectPortal>
					<SelectBackdrop />
					<SelectContent>
						<SelectDragIndicatorWrapper>
							<SelectDragIndicator />
						</SelectDragIndicatorWrapper>
						
					</SelectContent>
				</SelectPortal>
			</Select>




		</View>

	);
}
