import React from 'react';
import { ScrollView, View } from 'react-native';

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
import { Button, ButtonText, ButtonIcon, ButtonSpinner } from '@/components/ui/button';
import { ChevronDownIcon, ChevronUpIcon, TrashIcon, EditIcon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
} from '@/components/ui/modal';
import {
	Drawer,
	DrawerBackdrop,
	DrawerBody,
	DrawerCloseButton,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
} from '@/components/ui/drawer';

// Importações relacionadas à navegação e autenticação
import { router, useFocusEffect } from 'expo-router';
import { auth } from '@/FirebaseConfig';

// Componentes do Uiverse
import FloatingAlertViewport, { showFloatingAlert } from '@/components/uiverse/floating-alert';

// Importação das funções relacionadas a adição de usuário ao Firebase
import {
	getUserDataFirebase,
	getAllUsersFirebase,
	deleteUserFirebase,
	getRelatedUsersFirebase,
	deleteUserRelationFirebase,
} from '@/functions/RegisterUserFirebase';
import { addBankFirebase, getAllBanksFirebase, deleteBankFirebase } from '@/functions/BankFirebase';
import { deleteTagFirebase, getAllTagsFirebase } from '@/functions/TagFirebase';
import { getUserNameByIdFirebase } from '@/functions/RegisterUserFirebase';
import { Input, InputField, InputIcon } from '@/components/ui/input';
import { VStack } from '@/components/ui/vstack';
import { Box } from '@/components/ui/box';
import { Switch } from '@/components/ui/switch';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';

// Importação do SVG
import ConfigurationIllustration from '../assets/UnDraw/configurationsScreen.svg';

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

type PendingAction =
	| {
		type: 'delete-user';
		payload: { userId: string; identifier: string };
	}
	| {
		type: 'delete-related-user';
		payload: { userId: string; identifier: string };
	}
	| {
		type: 'delete-bank';
		payload: { bankId: string; bankName: string };
	}
	| {
		type: 'edit-bank';
		payload: { bank: { id: string; name: string; colorHex?: string | null } };
	}
	| {
		type: 'delete-tag';
		payload: { tagId: string; tagName: string };
	}
	| {
		type: 'edit-tag';
		payload: {
			tag: {
				id: string;
				name: string;
				usageType?: 'expense' | 'gain';
				isMandatoryExpense?: boolean;
				isMandatoryGain?: boolean;
			};
		};
	};

type DrawerType = 'users' | 'banks' | 'tags' | 'related-users';

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

	const result = await deleteUserFirebase(userId);

	if (result.success) {

	} else {

		showFloatingAlert({
			message: 'Erro ao deletar usuário. Tente novamente.',
			action: 'error',
			position: 'bottom',
		});
	}

	return result;
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

	const result = await addBankFirebase({ bankName, personId, colorHex: null });

	if (result.success) {

		showFloatingAlert({
			message: `Banco ${bankName} adicionado com sucesso.`,
			action: 'success',
			position: 'bottom',
		});

	} else {

		showFloatingAlert({
			message: 'Erro ao adicionar banco. Tente novamente.',
			action: 'error',
			position: 'bottom',
		});
	}

}

export async function handleDeleteBank(bankId: string) {

	const result = await deleteBankFirebase(bankId);

	if (result.success) {

	} else {

		showFloatingAlert({
			message: 'Erro ao deletar banco. Tente novamente.',
			action: 'error',
			position: 'bottom',
		});
	}

	return result;
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

	} else {

		showFloatingAlert({
			message: 'Erro ao deletar tag. Tente novamente.',
			action: 'error',
			position: 'bottom',
		});
	}

	return result;
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
	const [bankData, setBankData] = React.useState<Array<{ id: string; name: string; colorHex?: string | null }>>([]);
	const [tagData, setTagData] = React.useState<
		Array<{
			id: string;
			name: string;
			usageType?: 'expense' | 'gain';
			isMandatoryExpense?: boolean;
			isMandatoryGain?: boolean;
		}>
	>([]);
	const [relatedUserData, setRelatedUserData] = React.useState<Array<{ id: string; email: string }>>([]);
	const [userId, setUserId] = React.useState<string>('');
	const [isAdmin, setIsAdmin] = React.useState(false);
	const [isAdminLoading, setIsAdminLoading] = React.useState(true);
	const [isLoadingRelatedUsers, setIsLoadingRelatedUsers] = React.useState(false);
	const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
	const [isProcessingAction, setIsProcessingAction] = React.useState(false);
	const [openDrawer, setOpenDrawer] = React.useState<DrawerType | null>(null);
	const { shouldHideValues, setShouldHideValues, isLoadingPreference } = useValueVisibility();

	const handleToggleValueVisibility = React.useCallback(
		(value: boolean) => {
			setShouldHideValues(value);
		},
		[setShouldHideValues],
	);

	// Constante para armazenar o email do usuário logado atualmente
	const [currentUserEmail, setCurrentUserEmail] = React.useState<string>('');

	const handleUserRemoval = React.useCallback(
		async (userId: string, identifier: string) => {

			const result = await handleDeleteUser(userId);

			if (result.success) {
				setUserData(prev => prev.filter(user => user.id !== userId));
				showFloatingAlert({
					message: `Usuário ${identifier} foi excluído.`,
					action: 'success',
					position: 'bottom',
				});
			} else {
				showFloatingAlert({
					message: 'Não foi possível remover o usuário. Tente novamente.',
					action: 'error',
					position: 'bottom',
				});
			}
		},
		[],
	);

	const handleBankRemoval = React.useCallback(
		async (bankId: string, bankName: string) => {
			const result = await handleDeleteBank(bankId);

			if (result.success) {
				setBankData(prev => prev.filter(bank => bank.id !== bankId));
				showFloatingAlert({
					message: `Banco ${bankName || bankId} foi excluído.`,
					action: 'success',
					position: 'bottom',
				});
			} else {
				showFloatingAlert({
					message: 'Não foi possível remover o banco. Tente novamente.',
					action: 'error',
					position: 'bottom',
				});
			}
		},
		[],
	);

	const handleBankEdit = React.useCallback(
		(bank: { id: string; name: string; colorHex?: string | null }) => {
			if (!bank?.id) {
				return;
			}

			const encodedName = encodeURIComponent(bank?.name ?? '');
			const encodedColor = bank?.colorHex ? encodeURIComponent(bank.colorHex) : undefined;

			router.push({
				pathname: '/add-register-bank',
				params: {
					bankId: bank.id,
					bankName: encodedName,
					...(encodedColor ? { colorHex: encodedColor } : {}),
				},
			});
		},
		[router],
	);

	const handleTagRemoval = React.useCallback(
		async (tagId: string, tagName: string) => {
			const result = await handleDeleteTag(tagId);

			if (result.success) {
				setTagData(prev => prev.filter(tag => tag.id !== tagId));
				showFloatingAlert({
					message: `Tag ${tagName || tagId} foi excluída.`,
					action: 'success',
					position: 'bottom',
				});
			} else {
				showFloatingAlert({
					message: 'Não foi possível remover a tag. Tente novamente.',
					action: 'error',
					position: 'bottom',
				});
			}
		},
		[setTagData],
	);

	const handleRelatedUserRemoval = React.useCallback(
		async (relatedUserId: string, identifier: string) => {
			const result = await deleteUserRelationFirebase(relatedUserId);

			if (result.success) {
				setRelatedUserData(prev => prev.filter(user => user.id !== relatedUserId));
				showFloatingAlert({
					message: `Usuário ${identifier} foi desvinculado.`,
					action: 'success',
					position: 'bottom',
				});
			} else {
				showFloatingAlert({
					message: 'Não foi possível remover o vínculo. Tente novamente.',
					action: 'error',
					position: 'bottom',
				});
			}
		},
		[setRelatedUserData],
	);

	const handleOpenDrawer = React.useCallback((drawerType: DrawerType) => {
		setOpenDrawer(drawerType);
	}, []);

	const handleCloseDrawer = React.useCallback(() => {
		setOpenDrawer(null);
	}, []);

	const handleCloseActionModal = React.useCallback(() => {
		if (isProcessingAction) {
			return;
		}
		setPendingAction(null);
	}, [isProcessingAction]);

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) {
			return;
		}

		if (pendingAction.type === 'edit-bank') {
			handleBankEdit(pendingAction.payload.bank);
			setPendingAction(null);
			return;
		}

		if (pendingAction.type === 'edit-tag') {
			const encodedName = encodeURIComponent(pendingAction.payload.tag.name ?? '');
			const encodedUsage = pendingAction.payload.tag.usageType
				? encodeURIComponent(pendingAction.payload.tag.usageType)
				: undefined;
			const mandatoryExpenseFlag = pendingAction.payload.tag.isMandatoryExpense ? 'true' : 'false';
			const mandatoryGainFlag = pendingAction.payload.tag.isMandatoryGain ? 'true' : 'false';

			router.push({
				pathname: '/add-register-tag',
				params: {
					tagId: pendingAction.payload.tag.id,
					tagName: encodedName,
					...(encodedUsage ? { usageType: encodedUsage } : {}),
					isMandatoryExpense: mandatoryExpenseFlag,
					isMandatoryGain: mandatoryGainFlag,
				},
			});
			setPendingAction(null);
			return;
		}

		setIsProcessingAction(true);

		try {
			if (pendingAction.type === 'delete-user') {
				await handleUserRemoval(pendingAction.payload.userId, pendingAction.payload.identifier);
			} else if (pendingAction.type === 'delete-bank') {
				await handleBankRemoval(pendingAction.payload.bankId, pendingAction.payload.bankName);
			} else if (pendingAction.type === 'delete-tag') {
				await handleTagRemoval(pendingAction.payload.tagId, pendingAction.payload.tagName);
			} else if (pendingAction.type === 'delete-related-user') {
				await handleRelatedUserRemoval(pendingAction.payload.userId, pendingAction.payload.identifier);
			}
		} finally {
			setIsProcessingAction(false);
			setPendingAction(null);
		}
	}, [pendingAction, handleBankEdit, handleBankRemoval, handleTagRemoval, handleUserRemoval, handleRelatedUserRemoval]);

	const actionModalCopy = React.useMemo(() => {
		if (!pendingAction) {
			return {
				title: '',
				message: '',
				confirmLabel: 'Confirmar',
				isEdit: false,
			};
		}

		switch (pendingAction.type) {
			case 'delete-user':
				return {
					title: 'Remover usuário',
					message: `Tem certeza de que deseja remover o usuário ${pendingAction.payload.identifier || 'selecionado'
						}? Esta ação não pode ser desfeita.`,
					confirmLabel: 'Remover',
					isEdit: false,
				};
			case 'delete-related-user':
				return {
					title: 'Desvincular usuário',
					message: `Tem certeza de que deseja remover o vínculo com ${pendingAction.payload.identifier || 'o usuário selecionado'
						}?`,
					confirmLabel: 'Desvincular',
					isEdit: false,
				};
			case 'delete-bank':
				return {
					title: 'Excluir banco',
					message: `Tem certeza de que deseja excluir o banco ${pendingAction.payload.bankName || 'selecionado'
						}? Esta ação removerá todas as referências a ele.`,
					confirmLabel: 'Excluir',
					isEdit: false,
				};
			case 'edit-bank':
				return {
					title: 'Editar banco',
					message: `Deseja editar o banco ${pendingAction.payload.bank.name}? Você será redirecionado para a tela de edição.`,
					confirmLabel: 'Editar',
					isEdit: true,
				};
			case 'edit-tag':
				return {
					title: 'Editar tag',
					message: `Deseja editar a tag ${pendingAction.payload.tag.name}? Você será redirecionado para a tela de edição.`,
					confirmLabel: 'Editar',
					isEdit: true,
				};
			case 'delete-tag':
				return {
					title: 'Excluir tag',
					message: `Tem certeza de que deseja excluir a tag ${pendingAction.payload.tagName || 'selecionada'
						}? Esta ação não pode ser desfeita.`,
					confirmLabel: 'Excluir',
					isEdit: false,
				};
			default:
				return {
					title: '',
					message: '',
					confirmLabel: 'Confirmar',
					isEdit: false,
				};
		}
	}, [pendingAction]);

	const isModalOpen = Boolean(pendingAction);
	const confirmButtonAction = actionModalCopy.isEdit ? 'primary' : 'negative';
	const isDrawerOpen = Boolean(openDrawer);

	const drawerCopy = React.useMemo(() => {
		switch (openDrawer) {
			case 'users':
				return {
					title: 'Usuários cadastrados',
					subtitle: `${userData.length} registro(s) encontrados.`,
				};
			case 'banks':
				return {
					title: 'Bancos cadastrados',
					subtitle: `${bankData.length} registro(s) encontrados.`,
				};
			case 'tags':
				return {
					title: 'Tags cadastradas',
					subtitle: `${tagData.length} registro(s) encontrados.`,
				};
			case 'related-users':
				return {
					title: 'Usuários vinculados',
					subtitle: `${relatedUserData.length} registro(s) encontrados.`,
				};
			default:
				return {
					title: '',
					subtitle: '',
				};
		}
	}, [openDrawer, userData.length, bankData.length, tagData.length, relatedUserData.length]);

	const drawerContent = React.useMemo(() => {
		const renderEmptyState = (message: string) => (
			<View className="py-10 px-4">
				<Text className="text-center text-typografia-500">{message}</Text>
			</View>
		);

		const renderCardContainer = (children: React.ReactNode, key?: string) => (
			<View
				key={key}
				className="border border-outline-200 rounded-2xl p-4 bg-white dark:bg-gray-900 shadow-sm"
			>
				{children}
			</View>
		);

		if (!openDrawer) {
			return renderEmptyState('Selecione uma lista para visualizar.');
		}

		if (openDrawer === 'users') {
			if (!isAdmin) {
				return renderEmptyState('Você precisa ser administrador para visualizar os usuários.');
			}

			if (!userData.length) {
				return renderEmptyState('Nenhum usuário cadastrado até o momento.');
			}

			return (
				<VStack space="md">
					{userData.map(user =>
						renderCardContainer(
							<>
								<Text className="text-xs uppercase tracking-wide text-typografia-500">
									Email cadastrado
								</Text>
								<Text className="text-lg font-medium mt-1">{user.email ?? user.id}</Text>
								<View className="flex-row justify-end items-center mt-4">
									<Button
										size="xl"
										variant="link"
										action="negative"
										onPress={() =>
											setPendingAction({
												type: 'delete-user',
												payload: {
													userId: user.id,
													identifier: user.email ?? user.id,
												},
											})
										}
									>
										<ButtonIcon as={TrashIcon} />
									</Button>
								</View>
							</>,
							user.id,
						))}
				</VStack>
			);
		}

		if (openDrawer === 'banks') {
			if (!isAdmin) {
				return renderEmptyState('Você precisa ser administrador para visualizar os bancos.');
			}

			if (!bankData.length) {
				return renderEmptyState('Nenhum banco cadastrado até o momento.');
			}

			return (
				<VStack space="md">
					{bankData.map(bank =>
						renderCardContainer(
							<>
								<Text className="text-xs uppercase tracking-wide text-typografia-500">
									Banco cadastrado
								</Text>
								<Text className="text-lg font-medium mt-1">{bank.name}</Text>
								<View className="flex-row justify-end items-center gap-2 mt-4">
									<Button
										size="xl"
										variant="link"
										action="primary"
										onPress={() =>
											setPendingAction({
												type: 'edit-bank',
												payload: { bank },
											})
										}
									>
										<ButtonIcon as={EditIcon} />
									</Button>
									<Button
										size="xl"
										variant="link"
										action="negative"
										onPress={() =>
											setPendingAction({
												type: 'delete-bank',
												payload: {
													bankId: bank.id,
													bankName: bank.name,
												},
											})
										}
									>
										<ButtonIcon as={TrashIcon} />
									</Button>
								</View>
							</>,
							bank.id,
						))}
				</VStack>
			);
		}

		if (openDrawer === 'tags') {
			if (!isAdmin) {
				return renderEmptyState('Você precisa ser administrador para visualizar as tags.');
			}

			if (!tagData.length) {
				return renderEmptyState('Nenhuma tag cadastrada até o momento.');
			}

			const getTagTypeLabel = (tag: (typeof tagData)[number]) => {
				if (tag.usageType === 'gain') {
					return 'Ganhos';
				}
				if (tag.usageType === 'expense') {
					return 'Despesas';
				}
				return 'Não definido';
			};

			return (
				<VStack space="md">
					{tagData.map(tag =>
						renderCardContainer(
							<>
								<Text className="text-xs uppercase tracking-wide text-typografia-500">
									Tag cadastrada
								</Text>
								<Text className="text-lg font-medium mt-1">{tag.name}</Text>
								<Text className="text-sm text-typografia-500 mt-1">
									Tipo: {getTagTypeLabel(tag)}
								</Text>
								<View className="flex-row justify-end items-center gap-2 mt-4">
									<Button
										size="xl"
										variant="link"
										action="primary"
										onPress={() =>
											setPendingAction({
												type: 'edit-tag',
												payload: {
													tag: {
														id: tag.id,
														name: tag.name,
														usageType:
															tag.usageType === 'gain' || tag.usageType === 'expense'
																? tag.usageType
																: undefined,
														isMandatoryExpense: Boolean(tag.isMandatoryExpense),
														isMandatoryGain: Boolean(tag.isMandatoryGain),
													},
												},
											})
										}
									>
										<ButtonIcon as={EditIcon} />
									</Button>
									<Button
										size="xl"
										variant="link"
										action="negative"
										onPress={() =>
											setPendingAction({
												type: 'delete-tag',
												payload: {
													tagId: tag.id,
													tagName: tag.name,
												},
											})
										}
									>
										<ButtonIcon as={TrashIcon} />
									</Button>
								</View>
							</>,
							tag.id,
						))}
				</VStack>
			);
		}

		if (openDrawer === 'related-users') {
			if (isLoadingRelatedUsers) {
				return renderEmptyState('Carregando usuários vinculados...');
			}

			if (!relatedUserData.length) {
				return renderEmptyState('Você ainda não vinculou nenhum usuário.');
			}

			return (
				<VStack space="md">
					{relatedUserData.map(relatedUser =>
						renderCardContainer(
							<>
								<Text className="text-xs uppercase tracking-wide text-typografia-500">
									Usuário vinculado
								</Text>
								<Text className="text-lg font-medium mt-1">
									{relatedUser.email || relatedUser.id}
								</Text>
								<View className="flex-row justify-end items-center mt-4">
									<Button
										size="xl"
										variant="link"
										action="negative"
										onPress={() =>
											setPendingAction({
												type: 'delete-related-user',
												payload: {
													userId: relatedUser.id,
													identifier: relatedUser.email || relatedUser.id,
												},
											})
										}
									>
										<ButtonIcon as={TrashIcon} />
									</Button>
								</View>
							</>,
							relatedUser.id,
						))}
				</VStack>
			);
		}

		return null;
	}, [
		openDrawer,
		isAdmin,
		userData,
		bankData,
		tagData,
		relatedUserData,
		isLoadingRelatedUsers,
		setPendingAction,
	]);

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
							colorHex: typeof bank?.colorHex === 'string' ? bank.colorHex : null,
						}));

						setBankData(formattedBanks);
					}
				});

				fetchAllTags().then((tags) => {

					if (isMounted && tags) {
						const formattedTags = tags.map((tag: any) => ({
							id: tag.id,
							name: tag.name,
							usageType:
								typeof tag?.usageType === 'string' && (tag.usageType === 'gain' || tag.usageType === 'expense')
									? tag.usageType
									: undefined,
							isMandatoryExpense: Boolean(tag?.isMandatoryExpense),
							isMandatoryGain: Boolean(tag?.isMandatoryGain),
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

	// Atualiza o nome do usuário logado atualmente com base na busca no Firebase
	// com base no seu ID
	React.useEffect(() => {
		const fetchUserName = async () => {
			if (userId) {
				const result = await getUserNameByIdFirebase(userId);
				if (result.success) {
					setCurrentUserEmail(result.data || 'Desconhecido');
				} else {
					setCurrentUserEmail('Desconhecido');
				}
			} else {
				setCurrentUserEmail('Desconhecido');
			}
		};

		void fetchUserName();
	}, [userId]);

	return (
		<>
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
					keyboardDismissMode="on-drag"
					contentContainerStyle={{
						flexGrow: 1,
						paddingBottom: 48,
					}}
					nestedScrollEnabled
					showsVerticalScrollIndicator={false}
				>

					<View className="w-full px-6">

						<Heading
							size="3xl"
							className="
								text-center 
							"
						>
							Menu de Configurações
						</Heading>

						<Box className="w-full items-center mt-4">
							<ConfigurationIllustration width={160} height={160} />
						</Box>

						<Text className="text-justify text-gray-600 dark:text-gray-400 mt-4">
							Neste menu de configurações, você pode gerenciar usuários, bancos e tags associados ao
							aplicativo. Se você for um administrador, terá acesso a funcionalidades adicionais para
							gerenciar o sistema de forma mais eficaz.
						</Text>

						<Divider className="my-6 mb-6" />

						<VStack>

							<Text className="text-typography-500">Email do Usuário Atual e seu ID:</Text>
							<Input
								isDisabled={true}
								className="w-full mb-4"
							>
								<InputField
									type="text"
									placeholder="Email do Usuário"
									value={
										currentUserEmail ? `${currentUserEmail} (ID: ${userId})` : `Desconhecido (ID: ${userId})`
									}
									className="
										vw-full
										text-[12px]
									"
								/>
							</Input>

					</VStack>

					<View className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
						<View className="flex-row items-center justify-between">
							<View className="flex-1 pr-4">
								<Text className="text-base font-semibold text-gray-800 dark:text-gray-100">
									Ocultar valores financeiros
								</Text>
								<Text className="text-sm text-gray-600 dark:text-gray-400 mt-1">
									Ative esta opção para esconder totais de ganhos, despesas e saldos nas demais telas.
								</Text>
							</View>
							<Switch
								value={shouldHideValues}
								onValueChange={handleToggleValueVisibility}
								disabled={isLoadingPreference}
								trackColor={{ false: '#d4d4d4', true: '#525252' }}
								thumbColor="#fafafa"
								ios_backgroundColor="#d4d4d4"
							/>
						</View>
						<Text className="text-xs text-gray-500 dark:text-gray-400 mt-2">
							{isLoadingPreference
								? 'Verificando a preferência salva...'
								: shouldHideValues
									? 'Os valores financeiros estão ocultos.'
									: 'Os valores financeiros estão visíveis.'}
						</Text>
					</View>

					<Accordion
							size="md"
							variant="unfilled"
							type="single"
							isCollapsible
							className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 w-full mt-6"
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
												{item.showUsersTable && isAdmin && (
													<View className="mt-6 space-y-2">
														<Text className="text-typografia-500 text-gray-400 mb-2">
															{userData.length > 0
																? `${userData.length} usuário(s) cadastrados.`
																: 'Nenhum usuário cadastrado até o momento.'}
														</Text>
														<Button
															size="sm"
															variant="outline"
															onPress={() => handleOpenDrawer('users')}
														>
															<ButtonText>Visualizar usuários cadastrados</ButtonText>
														</Button>
													</View>
												)}

												{item.showBanksTable && isAdmin && (
													<View className="mt-6 space-y-2">
														<Text className="text-typografia-500 text-gray-400 mb-2">
															{bankData.length > 0
																? `${bankData.length} banco(s) cadastrados.`
																: 'Nenhum banco cadastrado até o momento.'}
														</Text>
														<Button
															size="sm"
															variant="outline"
															onPress={() => handleOpenDrawer('banks')}
														>
															<ButtonText>Visualizar bancos cadastrados</ButtonText>
														</Button>
													</View>
												)}

												{item.showTagsTable && isAdmin && (
													<View className="mt-6 space-y-2">
														<Text className="text-typografia-500 text-gray-400 mb-2">
															{tagData.length > 0
																? `${tagData.length} tag(s) cadastradas.`
																: 'Nenhuma tag cadastrada até o momento.'}
														</Text>
														<Button
															size="sm"
															variant="outline"
															onPress={() => handleOpenDrawer('tags')}
														>
															<ButtonText>Visualizar tags cadastradas</ButtonText>
														</Button>
													</View>
												)}

												{item.showRelatedUsersTable && (
													<View className="mt-6 space-y-2">
														<Text className="text-typografia-500 text-gray-400 mb-2">
															{isLoadingRelatedUsers
																? 'Carregando usuários vinculados...'
																: relatedUserData.length > 0
																	? `${relatedUserData.length} usuário(s) vinculados.`
																	: 'Você ainda não vinculou nenhum usuário.'}
														</Text>
														<Button
															size="sm"
															variant="outline"
															onPress={() => handleOpenDrawer('related-users')}
															isDisabled={isLoadingRelatedUsers}
														>
															{isLoadingRelatedUsers ? (
																<>
																	<ButtonSpinner />
																	<ButtonText>Carregando</ButtonText>
																</>
															) : (
																<ButtonText>Visualizar usuários vinculados</ButtonText>
															)}
														</Button>
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

			<Modal isOpen={isModalOpen} onClose={handleCloseActionModal}>
				<ModalBackdrop />
				<ModalContent className="max-w-[360px]">
					<ModalHeader>
						<Heading size="lg">{actionModalCopy.title}</Heading>
						<ModalCloseButton onPress={handleCloseActionModal} />
					</ModalHeader>
					<ModalBody>
						<Text className="text-gray-700 dark:text-gray-300">{actionModalCopy.message}</Text>
					</ModalBody>
					<ModalFooter className="gap-3">
						<Button variant="outline" onPress={handleCloseActionModal} isDisabled={isProcessingAction}>
							<ButtonText>Cancelar</ButtonText>
						</Button>
						<Button
							variant="solid"
							action={confirmButtonAction}
							onPress={handleConfirmAction}
							isDisabled={isProcessingAction}
						>
							{isProcessingAction ? (
								<>
									<ButtonSpinner color="white" />
									<ButtonText>Processando</ButtonText>
								</>
							) : (
								<ButtonText>{actionModalCopy.confirmLabel}</ButtonText>
							)}
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>

			<Drawer isOpen={isDrawerOpen} onClose={handleCloseDrawer} size="lg" anchor="right">
				<DrawerBackdrop onPress={handleCloseDrawer} />
				<DrawerContent>
					<DrawerHeader className="flex-row items-start justify-between gap-3">
						<VStack className="flex-1 space-y-1">

							<Box
								className="
									w-full
									mt-12
								"
							>
								<Heading size="lg">

									{drawerCopy.title || 'Itens cadastrados'}

								</Heading>

							</Box>

							{drawerCopy.subtitle ? (
								<Text className="text-sm text-typografia-500">{drawerCopy.subtitle}</Text>
							) : null}
						</VStack>
						<DrawerCloseButton onPress={handleCloseDrawer} />
					</DrawerHeader>
					<DrawerBody>
						{drawerContent}
					</DrawerBody>
					<DrawerFooter />
				</DrawerContent>
			</Drawer>
		</>
	);
}
