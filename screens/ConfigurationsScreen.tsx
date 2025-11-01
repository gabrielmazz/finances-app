import React from 'react';
import { View } from 'react-native';

// Importações relacionadas ao Gluestack UI
import { Heading } from '@/components/ui/heading';
import {
	Accordion,
	AccordionItem,
	AccordionHeader,
	AccordionTrigger,
	AccordionTitleText,
	AccordionContent,
	AccordionContentText,
	AccordionIcon,
} from '@/components/ui/accordion';
import { Divider } from '@/components/ui/divider';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icon';

// Importações relacionadas à navegação
import { router } from 'expo-router';

const accordionItems = [
	{
		id: 'item-1',
		title: 'Adicionar um novo usuário ao aplicativo',
		content:
			'Para adicionar um novo usuário, vá para a seção de configurações e selecione "Adicionar Usuário". Preencha as informações necessárias e salve as alterações.',
		screen: [
			{ 
				router: '/add-register-user',
				information: 'Registrar Usuário'
			},
		],
	},
	{
		id: 'item-2',
		title: 'Adicionar um novo banco ao aplicativo',
		content:
			'Para adicionar um novo banco, acesse a seção de configurações e clique em "Adicionar Banco". Insira os detalhes do banco e confirme para salvar.',
		screen: [
			{ 
				router: '/AddBank',
				information: 'Adicionar Banco'
			},
		],
	},
];

export default function ConfigurationsScreen() {
	return (
		<View className="mt-[64px] items-center">
			<Heading size="3xl" className="text-center mb-6">
				Menu de Configurações
			</Heading>

			<Accordion
				size="md"
				variant="unfilled"
				type="single"
				isCollapsible
				className="w-[90%] border border-outline-200"
			>
				{accordionItems.map((item, index) => (
					<React.Fragment key={item.id}>
						<AccordionItem value={item.id}>

							<AccordionHeader>

								<AccordionTrigger>
									{({ isExpanded }: { isExpanded: boolean }) => (
										<View className="flex-row items-center justify-between w-full">

											<AccordionTitleText className="font-semibold">
												{item.title}
											</AccordionTitleText>

											<AccordionIcon
												as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
												className="text-typography-700 ml-3"
											/>

										</View>

									)}

								</AccordionTrigger>

							</AccordionHeader>

							<AccordionContent>

								<AccordionContentText>
									{item.content}
								</AccordionContentText>

								<Button

									size="sm"
									variant="outline"
									className="mt-4"
								>
									<ButtonText
										onPress={() => {
											// Navegar para a tela correspondente
											if (item.screen) {
												router.push(item.screen[0].router);
											}
										}}
									>
										{item.screen ? item.screen[0].information : 'Ação'}
									</ButtonText>
									
								</Button>

							</AccordionContent>

						</AccordionItem>
						{index < accordionItems.length - 1 ? <Divider /> : null}

					</React.Fragment>
				))}
			</Accordion>
		</View>
	);
}
