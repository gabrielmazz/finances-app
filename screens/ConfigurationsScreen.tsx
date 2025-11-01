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
import { Button, ButtonText } from '@/components/ui/button';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icon';
import {
	Table,
	TableHeader,
	TableBody,
	TableHead,
	TableData,
	TableRow,
} from '@/components/ui/table';

// Importações relacionadas à navegação e autenticação
import { router } from 'expo-router';
import { auth } from '@/FirebaseConfig';

// Importação das funções relacionadas a adição de usuário ao Firebase
import { getUserDataFirebase, getAllUsersFirebase } from '@/functions/RegisterUserFirebase';

type AccordionItem = {
	id: string;
	title: string;
	content: string;
	action?: { router: string; label: string };
	showUsersTable?: boolean;
};

const accordionItems: AccordionItem[] = [
	{
		id: 'item-1',
		title: 'Adicionar um novo usuário ao aplicativo',
		content:
			'Para adicionar um novo usuário, vá para a seção de configurações e selecione "Adicionar Usuário". Preencha as informações necessárias e salve as alterações.',
		showUsersTable: true,
		action: {
			router: '/add-register-user',
			label: 'Registrar Usuário',
		},
	},
	{
		id: 'item-2',
		title: 'Adicionar um novo banco ao aplicativo',
		content:
			'Para adicionar um novo banco, acesse a seção de configurações e clique em "Adicionar Banco". Insira os detalhes do banco e confirme para salvar.',
		action: {
			router: '/AddBank',
			label: 'Adicionar Banco',
		},
	},
];


// ======================================== Relacionamento de Admin ================================================= //

// const ADMIN_EMAIL = 'admin@seu-dominio.com';
const ADMIN_EMAIL = 'gabrielalvesmazzuco@gmail.com';

export async function fetchUserData(userId: string) {

	const result = await getUserDataFirebase(userId);

	if (result.success) {

		return result.data;

	} else {

		console.error('Erro ao buscar dados do usuário:', result.error);
		return null;

	}
}


export async function fetchAllUsers() {

	const result = await getAllUsersFirebase();

	if (result.success) {

		return result.data;

	} else {

		console.error('Erro ao buscar todos os usuários:', result.error);
		return null;
	}
}

// ================================================================================================================= //

export default function ConfigurationsScreen() {

	// Verifica se o usuário atual é o administrador do sistema
	const currentEmail = auth.currentUser?.email ?? '';
	const isAdmin = currentEmail === ADMIN_EMAIL;
	const [userData, setUserData] = React.useState<Array<{ id: string; email: string }>>([]);

	React.useEffect(() => {
		let isMounted = true;

		if (isAdmin) {
			fetchAllUsers().then((users) => {
				if (isMounted && users) {
					const formattedUsers = users.map((user: any) => ({
						id: user.id,
						email: user.email,
					}));

					setUserData(formattedUsers);
				}
			});
		} else {
			setUserData([]);
		}

		return () => {
			isMounted = false;
		};
	}, [isAdmin]);

	return (

		<View
			className="
				mt-[64px]
				items-center
			"
		>

			<Heading
				size="3xl"
				className="
					text-center 
					mb-6
				"
			>
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


								{/* Conteúdo adicional visível apenas para administradores */}
								{item.showUsersTable && isAdmin && userData.length > 0 && (
									<View className="mt-6 mb-4">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>
														Email cadastrado no sistema
													</TableHead>
												</TableRow>
											</TableHeader>

											<TableBody>
												{userData.map((user) => (
													<TableRow key={user.id}>
														<TableData>{user.email}</TableData>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</View>
								)}

								{item.action ? (
									<Button
										size="sm"
										variant="outline"
										className="mt-4"
										isDisabled={!isAdmin}
										onPress={() => {
											if (isAdmin) {
												router.push(item.action!.router);
											} else {
												alert('Acesso negado: Você não tem permissão para realizar esta ação.');
											}
										}}
									>
										<ButtonText>{item.action.label}</ButtonText>
									</Button>
								) : null}
							</AccordionContent>

						</AccordionItem>

						{index < accordionItems.length - 1 ? <Divider /> : null}

					</React.Fragment>
				))}

			</Accordion>

		</View>
	);
}
