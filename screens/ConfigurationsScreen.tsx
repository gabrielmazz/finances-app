import React from 'react';
import { Keyboard, ScrollView, TouchableWithoutFeedback, View } from 'react-native';

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
import { Button, ButtonText, ButtonIcon } from '@/components/ui/button';
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from '@/components/ui/icon';
import {
	Table,
	TableHeader,
	TableBody,
	TableHead,
	TableData,
	TableRow,
} from '@/components/ui/table';
import { Text } from '@/components/ui/text';

// Importações relacionadas à navegação e autenticação
import { router, useFocusEffect } from 'expo-router';
import { auth } from '@/FirebaseConfig';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';

// Importação das funções relacionadas a adição de usuário ao Firebase
import { getUserDataFirebase, getAllUsersFirebase, deleteUserFirebase, getRelatedUsersFirebase } from '@/functions/RegisterUserFirebase';
import { addBankFirebase, getAllBanksFirebase, deleteBankFirebase } from '@/functions/BankFirebase';
import { deleteTagFirebase, getAllTagsFirebase } from '@/functions/TagFirebase';
import { Input, InputField, InputIcon } from '@/components/ui/input';
import { VStack } from '@/components/ui/vstack';

type AccordionItem = {
	id: string;
	title: string;
	content: string;
	action?: { router: string; label: string };
	actionRequiresAdmin?: boolean;
	showUsersTable?: boolean;
	showBanksTable?: boolean;
	showTagsTable?: boolean;
	showRelatedUsersTable?: boolean;
};

const accordionItems: AccordionItem[] = [
	{
		id: 'item-1',
		title: 'Adicionar um novo usuário ao aplicativo',
		content:
			'Para adicionar um novo usuário, vá para a seção de configurações e selecione "Adicionar Usuário". Preencha as informações necessárias e salve as alterações.',
		showUsersTable: true,
		actionRequiresAdmin: true,
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
		showBanksTable: true,
		actionRequiresAdmin: true,
		action: {
			router: '/add-register-bank',
			label: 'Adicionar Banco',
		},
	},
	{
		id: 'item-3',
		title: 'Adicionar uma nova tag ao aplicativo',
		content:
			'Para adicionar uma nova tag, acesse a seção de configurações e clique em "Adicionar Tag". Insira o nome desejado e confirme para salvar.',
		showTagsTable: true,
		actionRequiresAdmin: true,
		action: {
			router: '/add-register-tag',
			label: 'Adicionar Tag',
		},
	},
	{
		id: 'item-4',
		title: 'Relacionar outro usuário à sua conta',
		content:
			'Para compartilhar as movimentações financeiras com outra pessoa, informe o ID dela e confirme o vínculo.',
		showRelatedUsersTable: true,
		actionRequiresAdmin: false,
		action: {
			router: '/add-user-relation',
			label: 'Relacionar Usuário',
		},
	},
];

// ================================= Relacionamento de Admin (Usuários) ============================================= //

export async function fetchUserData(userId: string) {

	const result = await getUserDataFirebase(userId);

	if (result.success) {

		return result.data;

	} else {

		console.error('Erro ao buscar dados do usuário:', result.error);
		return null;

	}
}

export async function handleDeleteUser(userId: string) {

	// Evita que o usuário atual se delete e se ele for um admin
	const currentUser = auth.currentUser;

	if (currentUser && currentUser.uid === userId) {
		alert('Ação inválida: Você não pode deletar o usuário atualmente logado.');
		return;
	}

	const result = await deleteUserFirebase(userId);

	if (result.success) {

		console.log('Usuário deletado com sucesso:', userId);

	} else {

		console.error('Erro ao deletar usuário:', result.error);
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

export async function fetchRelatedUsers(userId: string) {

	const result = await getRelatedUsersFirebase(userId);

	if (result.success) {

		return result.data;

	} else {

		return null;

	}

}

// ================================== Relacionamento de Admin (Bancos) ============================================== //

export async function handleAddBank(bankName: string) {

	const personId = auth.currentUser?.uid;

	if (!personId) {
		console.error('Não foi possível identificar o usuário atual ao adicionar banco.');
		return null;
	}

	const result = await addBankFirebase({ bankName, personId });

	if (result.success) {

		console.log('Banco adicionado com sucesso:', result.bankId);

	} else {

		console.error('Erro ao adicionar banco:', result.error);
	}

}

export async function handleDeleteBank(bankId: string) {

	const result = await deleteBankFirebase(bankId);

	if (result.success) {

		console.log('Banco deletado com sucesso:', bankId);

	} else {

		console.error('Erro ao deletar banco:', result.error);
	}
}

export async function fetchAllBanks() {

	const result = await getAllBanksFirebase();

	if (result.success) {

		return result.data;

	} else {

		console.error('Erro ao buscar todos os bancos:', result.error);
		return null;
	}
}

// ================================== Relacionamento de Admin (Tags) =============================================== //

export async function handleDeleteTag(tagId: string) {

	const result = await deleteTagFirebase(tagId);

	if (result.success) {

		console.log('Tag deletada com sucesso:', tagId);

	} else {

		console.error('Erro ao deletar tag:', result.error);
	}
}

export async function fetchAllTags() {

	const result = await getAllTagsFirebase();

	if (result.success) {

		return result.data;

	} else {

		console.error('Erro ao buscar todas as tags:', result.error);
		return null;
	}
}

// ================================================================================================================= //

export default function ConfigurationsScreen() {

	const [userData, setUserData] = React.useState<Array<{ id: string; email: string }>>([]);
	const [bankData, setBankData] = React.useState<Array<{ id: string; name: string }>>([]);
	const [tagData, setTagData] = React.useState<Array<{ id: string; name: string }>>([]);
	const [relatedUserData, setRelatedUserData] = React.useState<Array<{ id: string; email: string }>>([]);
	const [userId, setUserId] = React.useState<string>('');
	const [isAdmin, setIsAdmin] = React.useState(false);
	const [isAdminLoading, setIsAdminLoading] = React.useState(true);
	const [isLoadingRelatedUsers, setIsLoadingRelatedUsers] = React.useState(false);

	// Verifica se o usuário atual possui flag de administrador no Firestore
	React.useEffect(() => {
		let isMounted = true;

		const loadAdminFlag = async () => {
			try {
				const currentUser = auth.currentUser;

				if (!currentUser) {
					if (isMounted) {
						setIsAdmin(false);
					}
					return;
				}

				const result = await getUserDataFirebase(currentUser.uid);

				if (!isMounted) {
					return;
				}

				setIsAdmin(Boolean(result.success && (result.data as any)?.adminUser));
			} catch (error) {
				console.error('Erro ao verificar privilégios de administrador:', error);
				if (isMounted) {
					setIsAdmin(false);
				}
			} finally {
				if (isMounted) {
					setIsAdminLoading(false);
				}
			}
		};

		loadAdminFlag();

		return () => {
			isMounted = false;
		};
	}, []);

	// Buscar todos as informações para mostrar na tabela de usuários, bancos
	useFocusEffect(
		React.useCallback(() => {

			let isMounted = true;

			if (!isAdminLoading && isAdmin) {

				fetchAllUsers().then((users) => {

					if (isMounted && users) {
						const formattedUsers = users.map((user: any) => ({
							id: user.id,
							email: user.email,
						}));

						setUserData(formattedUsers);
					}
				});

				fetchAllBanks().then((banks) => {

					if (isMounted && banks) {
						const formattedBanks = banks.map((bank: any) => ({
							id: bank.id,
							name: bank.name,
						}));

						setBankData(formattedBanks);
					}
				});

				fetchAllTags().then((tags) => {

					if (isMounted && tags) {
						const formattedTags = tags.map((tag: any) => ({
							id: tag.id,
							name: tag.name,
						}));

						setTagData(formattedTags);
					}
				});


			} else {

				if (isMounted) {
					setUserData([]);
					setBankData([]);
					setTagData([]);
				}
			}

			return () => {

				isMounted = false;

			};
		}, [isAdmin, isAdminLoading]),
	);

	// ================================================================================================================= //

	// Função para atualizar o userId com base no login do usuário, como o userId é o uid do usuário no Firebase Auth
	React.useEffect(() => {

		const fetchAndSetUserId = async () => {

			const currentUser = auth.currentUser;

			if (currentUser) {

				setUserId(currentUser.uid);

			} else {

				setUserId('');

			}
		};

		fetchAndSetUserId();

	}, []);

	useFocusEffect(
		React.useCallback(() => {
			let isMounted = true;

			const loadRelatedUsers = async () => {
				if (!userId) {
					if (isMounted) {
						setRelatedUserData([]);
						setIsLoadingRelatedUsers(false);
					}
					return;
				}

				setIsLoadingRelatedUsers(true);

				try {
					const relatedUsers = await fetchRelatedUsers(userId);

					if (!isMounted) {
						return;
					}

					if (Array.isArray(relatedUsers)) {
						const formattedRelatedUsers = relatedUsers.map((user: any) => ({
							id: user.id,
							email: user.email,
						}));

						setRelatedUserData(formattedRelatedUsers);
					} else {
						setRelatedUserData([]);
					}
				} catch (error) {
					console.error('Erro ao carregar usuários vinculados:', error);
					if (isMounted) {
						setRelatedUserData([]);
					}
				} finally {
					if (isMounted) {
						setIsLoadingRelatedUsers(false);
					}
				}
			};

			void loadRelatedUsers();

			return () => {
				isMounted = false;
			};
		}, [userId]),
	);

	return (

		<TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
			<View
				className="
				flex-1 w-full h-full
				mt-[64px]
				pb-6
				relative
			"
			>

				<ScrollView
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{
						flexGrow: 1,
						paddingBottom: 48,
					}}
				>

					<View className="w-full px-6">


						<Heading
							size="3xl"
							className="
					text-center 
					mb-6
				"
						>
							Menu de Configurações
						</Heading>

						<VStack>
							<Text className="text-typography-500">ID do Usuário Atual:</Text>
							<Input
								isDisabled={true}
								className="w-full mb-4"
							>
								<InputField
									type="text"
									placeholder="ID do Usuário"
									value={userId}
									className="
							vw-
						"
								/>
							</Input>
						</VStack>

						<Accordion
							size="md"
							variant="unfilled"
							type="single"
							isCollapsible
							className="w-full border border-outline-200"
						>
							{accordionItems.map((item, index) => {
								const requiresAdmin = item.actionRequiresAdmin !== false;
								const canExecuteAction = !requiresAdmin || isAdmin;

								return (
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

														<Table
															className="
												w-full
												border
												border-outline-200
												rounded-lg
												overflow-hidden
											"
														>

															<TableHeader>

																<TableRow>

																	<TableHead>
																		Email cadastrado
																	</TableHead>

																	<TableHead
																		className="
															text-center
														"
																	>
																		Ações
																	</TableHead>

																</TableRow>

															</TableHeader>

															<TableBody>

																{userData.map((user) => (

																	<TableRow key={user.id}>

																		<TableData>

																			<Text
																				size="md"
																			>
																				{user.email}
																			</Text>

																		</TableData>

																		<TableData useRNView>

																			<Button
																				size="xs"
																				variant="link"
																				action="negative"
																				onPress={
																					() => handleDeleteUser(user.id)

																						// Recarregar a pagina de configurações apos deletar o usuario
																						.then(() => {
																							router.replace('/Configurations');
																						})
																				}
																			>
																				<ButtonIcon as={TrashIcon} />
																			</Button>

																		</TableData>

																	</TableRow>
																))}

															</TableBody>

														</Table>

													</View>
												)}

												{item.showBanksTable && isAdmin && bankData.length > 0 && (
													<View className="mt-6 mb-4">

														<Table
															className="
												w-full
												border
												border-outline-200
												rounded-lg
												overflow-hidden
											"
														>

															<TableHeader>

																<TableRow>

																	<TableHead>
																		Banco cadastrado
																	</TableHead>

																	<TableHead
																		className="
															text-center
														"
																	>
																		Ações
																	</TableHead>

																</TableRow>

															</TableHeader>

															<TableBody>

																{bankData.map((bank) => (

																	<TableRow key={bank.id}>

																		<TableData>

																			<Text
																				size="md"
																			>
																				{bank.name}
																			</Text>

																		</TableData>

																		<TableData useRNView>

																			<Button
																				size="xs"
																				variant="link"
																				action="negative"
																				onPress={
																					() => handleDeleteBank(bank.id)
																						.then(() => {
																							router.replace('/Configurations');
																						})
																				}
																			>
																				<ButtonIcon as={TrashIcon} />
																			</Button>

																		</TableData>

																	</TableRow>
																))}

															</TableBody>

														</Table>

													</View>
												)}

												{item.showTagsTable && isAdmin && tagData.length > 0 && (
													<View className="mt-6 mb-4">

														<Table
															className="
												w-full
												border
												border-outline-200
												rounded-lg
												overflow-hidden
											"
														>

															<TableHeader>

																<TableRow>

																	<TableHead>
																		Tag cadastrada
																	</TableHead>

																	<TableHead
																		className="
															text-center
														"
																	>
																		Ações
																	</TableHead>

																</TableRow>

															</TableHeader>

															<TableBody>

																{tagData.map((tag) => (

																	<TableRow key={tag.id}>

																		<TableData>

																			<Text
																				size="md"
																			>
																				{tag.name}
																			</Text>

																		</TableData>

																		<TableData useRNView>

																			<Button
																				size="xs"
																				variant="link"
																				action="negative"
																				onPress={
																					() => handleDeleteTag(tag.id)
																						.then(() => {
																							router.replace('/Configurations');
																						})
																				}
																			>
																				<ButtonIcon as={TrashIcon} />
																			</Button>

																		</TableData>

																	</TableRow>
																))}

															</TableBody>

														</Table>

													</View>
												)}

												{item.showRelatedUsersTable && (
													<View className="mt-6 mb-4">
														{isLoadingRelatedUsers ? (
															<Text className="text-center text-typography-500">
																Carregando usuários vinculados...
															</Text>
														) : relatedUserData.length > 0 ? (
															<Table
																className="
															w-full
															border
															border-outline-200
															rounded-lg
															overflow-hidden
														"
															>
																<TableHeader>
																	<TableRow>
																		<TableHead>Usuário vinculado</TableHead>
																	</TableRow>
																</TableHeader>

																<TableBody>
																	{relatedUserData.map(relatedUser => (
																		<TableRow key={relatedUser.id}>
																			<TableData>
																				<Text size="md">
																					{relatedUser.email || relatedUser.id}
																				</Text>
																			</TableData>
																		</TableRow>
																	))}
																</TableBody>
															</Table>
														) : (
															<Text className="text-center text-typography-500">
																Você ainda não vinculou nenhum usuário.
															</Text>
														)}
													</View>
												)}



												{item.action ? (
													<Button
														size="sm"
														variant="outline"
														className="mt-4"
														// isDisabled={!canExecuteAction}
														onPress={() => {
															router.push(item.action!.router);
														}}
													>
														<ButtonText>{item.action.label}</ButtonText>
													</Button>
												) : null}
											</AccordionContent>

										</AccordionItem>

										{index < accordionItems.length - 1 ? <Divider /> : null}

									</React.Fragment>
								);
							})}

						</Accordion>
					</View>

				</ScrollView>
			</View>
		</TouchableWithoutFeedback>
	);
}
