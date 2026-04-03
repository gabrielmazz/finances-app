import React from 'react';
import { ScrollView, View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { Button, ButtonText, ButtonIcon, ButtonSpinner } from '@/components/ui/button';
import { ChevronDownIcon, ChevronUpIcon, TrashIcon, EditIcon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
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
import {
	Select,
	SelectBackdrop,
	SelectContent,
	SelectDragIndicator,
	SelectDragIndicatorWrapper,
	SelectIcon,
	SelectInput,
	SelectItem,
	SelectPortal,
	SelectTrigger,
} from '@/components/ui/select';

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
import { Input, InputField } from '@/components/ui/input';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Box } from '@/components/ui/box';
import { Switch } from '@/components/ui/switch';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { useScreenStyles } from '@/hooks/useScreenStyle';

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
	showValueVisibilitySwitch?: boolean;
	showThemeSwitch?: boolean;
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
	{
		id: 'item-5',
		title: 'Preferências de valores financeiros',
		content: 'Ative ou desative a exibição de valores financeiros em todo o aplicativo.',
		showValueVisibilitySwitch: true,
		actionRequiresAdmin: false,
	},
	{
		id: 'item-6',
		title: 'Tema do aplicativo',
		content: 'Alterne entre o modo claro e escuro para personalizar a aparência do app.',
		showThemeSwitch: true,
		actionRequiresAdmin: false,
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
				showInBothLists?: boolean;
				iconFamily?: TagIconFamily | null;
				iconName?: string | null;
				iconStyle?: TagIconStyle | null;
			};
		};
	};

type DrawerType = 'users' | 'banks' | 'tags' | 'related-users';

function ConfigurationsSkeleton({
	topSummaryCardClassName,
	compactCardClassName,
	skeletonBaseColor,
	skeletonHighlightColor,
	skeletonMutedBaseColor,
	skeletonMutedHighlightColor,
}: {
	topSummaryCardClassName: string;
	compactCardClassName: string;
	skeletonBaseColor: string;
	skeletonHighlightColor: string;
	skeletonMutedBaseColor: string;
	skeletonMutedHighlightColor: string;
}) {
	return (
		<VStack className="mt-4 gap-4">
			<Box className={`${topSummaryCardClassName} px-5 py-5`}>
				<VStack className="gap-4">
					<Skeleton className="h-3 w-28" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					<Skeleton className="h-8 w-56" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					<SkeletonText _lines={2} className="h-3" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					<HStack className="gap-3">
						<Skeleton className="h-20 flex-1 rounded-2xl" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
						<Skeleton className="h-20 flex-1 rounded-2xl" baseColor={skeletonMutedBaseColor} highlightColor={skeletonMutedHighlightColor} />
					</HStack>
				</VStack>
			</Box>

			{Array.from({ length: 4 }).map((_, index) => (
				<Box key={`configurations-skeleton-${index}`} className={`${compactCardClassName} px-4 py-4`}>
					<VStack className="gap-3">
						<HStack className="items-center justify-between gap-3">
							<VStack className="flex-1 gap-2">
								<Skeleton className="h-5 w-52" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
								<Skeleton className="h-3 w-32" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
							</VStack>
							<Skeleton className="h-5 w-5 rounded-full" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
						</HStack>
						<SkeletonText _lines={2} className="h-3" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
						<Skeleton className="h-10 rounded-2xl" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
					</VStack>
				</Box>
			))}
		</VStack>
	);
}

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
	const {
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		inputField,
		fieldContainerClassName,
		compactCardClassName,
		tintedCardClassName,
		topSummaryCardClassName,
		submitButtonClassName,
		modalContentClassName,
		drawerContentClassName,
		drawerHeaderCardClassName,
		heroHeight,
		insets,
		skeletonBaseColor,
		skeletonHighlightColor,
		skeletonMutedBaseColor,
		skeletonMutedHighlightColor,
	} = useScreenStyles();

	const [userData, setUserData] = React.useState<Array<{ id: string; email: string }>>([]);
	const [bankData, setBankData] = React.useState<Array<{ id: string; name: string; colorHex?: string | null }>>([]);
	const [tagData, setTagData] = React.useState<
		Array<{
			id: string;
			name: string;
			usageType?: 'expense' | 'gain';
			isMandatoryExpense?: boolean;
			isMandatoryGain?: boolean;
			showInBothLists?: boolean;
			iconFamily?: TagIconFamily | null;
			iconName?: string | null;
			iconStyle?: TagIconStyle | null;
		}>
	>([]);
	const [tagFilter, setTagFilter] = React.useState<
		'all' | 'expense' | 'mandatory-expense' | 'gain' | 'mandatory-gain'
	>('all');
	const tagFilterLabels: Record<typeof tagFilter, string> = {
		all: 'Todas',
		expense: 'Despesas',
		'mandatory-expense': 'Despesas obrigatórias',
		gain: 'Ganhos',
		'mandatory-gain': 'Ganhos obrigatórios',
	};
	const [relatedUserData, setRelatedUserData] = React.useState<Array<{ id: string; email: string }>>([]);
	const [userId, setUserId] = React.useState<string>('');
	const [isAdmin, setIsAdmin] = React.useState(false);
	const [isAdminLoading, setIsAdminLoading] = React.useState(true);
	const [isLoadingRelatedUsers, setIsLoadingRelatedUsers] = React.useState(false);
	const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
	const [isProcessingAction, setIsProcessingAction] = React.useState(false);
	const [openDrawer, setOpenDrawer] = React.useState<DrawerType | null>(null);
	const { shouldHideValues, setShouldHideValues, isLoadingPreference } = useValueVisibility();
	const { isDarkMode, setThemeMode, isLoadingTheme } = useAppTheme();

	const handleToggleValueVisibility = React.useCallback(
		(value: boolean) => {
			setShouldHideValues(value);
		},
		[setShouldHideValues],
	);

	const handleToggleDarkMode = React.useCallback(
		(value: boolean) => {
			if (isLoadingTheme || value === isDarkMode) {
				return;
			}
			setThemeMode(value ? 'dark' : 'light');
		},
		[isDarkMode, isLoadingTheme, setThemeMode],
	);

	const filteredTags = React.useMemo(() => {
		return tagData.filter(tag => {
			if (tagFilter === 'all') {
				return true;
			}
			if (tagFilter === 'expense') {
				return tag.usageType === 'expense' && (!tag.isMandatoryExpense || tag.showInBothLists);
			}
			if (tagFilter === 'mandatory-expense') {
				return tag.usageType === 'expense' && Boolean(tag.isMandatoryExpense);
			}
			if (tagFilter === 'gain') {
				return tag.usageType === 'gain' && (!tag.isMandatoryGain || tag.showInBothLists);
			}
			if (tagFilter === 'mandatory-gain') {
				return tag.usageType === 'gain' && Boolean(tag.isMandatoryGain);
			}
			return true;
		});
	}, [tagData, tagFilter]);

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
			const encodedIconFamily = pendingAction.payload.tag.iconFamily
				? encodeURIComponent(pendingAction.payload.tag.iconFamily)
				: undefined;
			const encodedIconName = pendingAction.payload.tag.iconName
				? encodeURIComponent(pendingAction.payload.tag.iconName)
				: undefined;
			const encodedIconStyle = pendingAction.payload.tag.iconStyle
				? encodeURIComponent(pendingAction.payload.tag.iconStyle)
				: undefined;
			const mandatoryExpenseFlag = pendingAction.payload.tag.isMandatoryExpense ? 'true' : 'false';
			const mandatoryGainFlag = pendingAction.payload.tag.isMandatoryGain ? 'true' : 'false';
			const showInBothListsFlag = pendingAction.payload.tag.showInBothLists ? 'true' : 'false';

			router.push({
				pathname: '/add-register-tag',
				params: {
					tagId: pendingAction.payload.tag.id,
					tagName: encodedName,
					...(encodedUsage ? { usageType: encodedUsage } : {}),
					...(encodedIconFamily ? { tagIconFamily: encodedIconFamily } : {}),
					...(encodedIconName ? { tagIconName: encodedIconName } : {}),
					...(encodedIconStyle ? { tagIconStyle: encodedIconStyle } : {}),
					isMandatoryExpense: mandatoryExpenseFlag,
					isMandatoryGain: mandatoryGainFlag,
					showInBothLists: showInBothListsFlag,
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
					subtitle: `${filteredTags.length} registro(s) encontrados.`,
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
	}, [openDrawer, userData.length, bankData.length, filteredTags.length, relatedUserData.length]);

	const drawerContent = React.useMemo(() => {
		const renderEmptyState = (message: string) => (
			<Box className={`${compactCardClassName} px-4 py-10`}>
				<Text className={`text-center ${helperText}`}>{message}</Text>
			</Box>
		);

		const renderCardContainer = (children: React.ReactNode, key?: string) => (
			<Box key={key} className={`${compactCardClassName} px-4 py-4`}>
				{children}
			</Box>
		);

		const renderLoadingState = () => (
			<VStack className="gap-3">
				{Array.from({ length: 3 }).map((_, index) => (
					<Box key={`drawer-skeleton-${index}`} className={`${compactCardClassName} px-4 py-4`}>
						<VStack className="gap-3">
							<Skeleton className="h-4 w-28" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
							<Skeleton className="h-5 w-48" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
							<Skeleton className="h-9 w-28 rounded-2xl" baseColor={skeletonBaseColor} highlightColor={skeletonHighlightColor} />
						</VStack>
					</Box>
				))}
			</VStack>
		);

		const getTagTypeLabel = (tag: (typeof tagData)[number]) => {
			if (tag.usageType === 'gain') {
				return 'Ganhos';
			}
			if (tag.usageType === 'expense') {
				return 'Despesas';
			}
			return 'Não definido';
		};

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
				<VStack className="gap-3">
					{userData.map(user =>
						renderCardContainer(
							<VStack className="gap-3">
								<VStack className="gap-1">
									<Text className={`${helperText} text-xs uppercase tracking-wide`}>Usuário cadastrado</Text>
									<Text className="text-base font-semibold">{user.email ?? user.id}</Text>
								</VStack>
								<HStack className="justify-end">
									<Button
										size="sm"
										variant="outline"
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
										<ButtonText>Excluir</ButtonText>
									</Button>
								</HStack>
							</VStack>,
							user.id,
						),
					)}
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
				<VStack className="gap-3">
					{bankData.map(bank =>
						renderCardContainer(
							<VStack className="gap-3">
								<HStack className="items-center gap-3">
									<View
										className="h-3 w-3 rounded-full"
										style={{ backgroundColor: bank.colorHex || (isDarkMode ? '#FACC15' : '#F59E0B') }}
									/>
									<VStack className="flex-1 gap-1">
										<Text className={`${helperText} text-xs uppercase tracking-wide`}>Banco cadastrado</Text>
										<Text className="text-base font-semibold">{bank.name}</Text>
									</VStack>
								</HStack>
								<HStack className="justify-end gap-2">
									<Button
										size="sm"
										variant="outline"
										action="primary"
										onPress={() =>
											setPendingAction({
												type: 'edit-bank',
												payload: { bank },
											})
										}
									>
										<ButtonIcon as={EditIcon} />
										<ButtonText>Editar</ButtonText>
									</Button>
									<Button
										size="sm"
										variant="outline"
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
										<ButtonText>Excluir</ButtonText>
									</Button>
								</HStack>
							</VStack>,
							bank.id,
						),
					)}
				</VStack>
			);
		}

		if (openDrawer === 'tags') {
			if (!isAdmin) {
				return renderEmptyState('Você precisa ser administrador para visualizar as tags.');
			}

			return (
				<VStack className="gap-3">
					<Box className={`${compactCardClassName} px-4 py-4`}>
						<Text className="mb-2 text-sm font-semibold">Filtrar tags por tipo</Text>
						<Select selectedValue={tagFilter} onValueChange={value => setTagFilter(value as any)}>
							<SelectTrigger variant="outline" size="md" className={fieldContainerClassName}>
								<SelectInput
									placeholder="Selecione um filtro"
									value={tagFilterLabels[tagFilter]}
									className={inputField}
								/>
								<SelectIcon />
							</SelectTrigger>
							<SelectPortal>
								<SelectBackdrop />
								<SelectContent>
									<SelectDragIndicatorWrapper>
										<SelectDragIndicator />
									</SelectDragIndicatorWrapper>
									<SelectItem label="Todas" value="all" />
									<SelectItem label="Despesas" value="expense" />
									<SelectItem label="Despesas obrigatórias" value="mandatory-expense" />
									<SelectItem label="Ganhos" value="gain" />
									<SelectItem label="Ganhos obrigatórios" value="mandatory-gain" />
								</SelectContent>
							</SelectPortal>
						</Select>
					</Box>

					{!filteredTags.length
						? renderEmptyState('Nenhuma tag encontrada para o filtro selecionado.')
						: filteredTags.map(tag =>
								renderCardContainer(
									<VStack className="gap-3">
										<HStack className="items-start gap-3">
											<View className={`${tintedCardClassName} h-11 w-11 items-center justify-center`}>
												<TagIcon
													iconFamily={tag.iconFamily}
													iconName={tag.iconName}
													iconStyle={tag.iconStyle}
													size={20}
													color={isDarkMode ? '#FCD34D' : '#D97706'}
												/>
											</View>
											<VStack className="flex-1 gap-1">
												<Text className={`${helperText} text-xs uppercase tracking-wide`}>Tag cadastrada</Text>
												<Text className="text-base font-semibold">{tag.name}</Text>
												<Text className={`${helperText} text-sm`}>Tipo: {getTagTypeLabel(tag)}</Text>
											</VStack>
										</HStack>
										<View className="flex-row flex-wrap gap-2">
											{tag.isMandatoryExpense ? (
												<Box className={`${tintedCardClassName} px-3 py-2`}>
													<Text className="text-xs text-orange-600 dark:text-orange-400">Despesa obrigatória</Text>
												</Box>
											) : null}
											{tag.isMandatoryGain ? (
												<Box className={`${tintedCardClassName} px-3 py-2`}>
													<Text className="text-xs text-emerald-600 dark:text-emerald-400">Ganho obrigatório</Text>
												</Box>
											) : null}
											{tag.showInBothLists ? (
												<Box className={`${tintedCardClassName} px-3 py-2`}>
													<Text className="text-xs text-sky-600 dark:text-sky-400">Listas normal e obrigatória</Text>
												</Box>
											) : null}
										</View>
										<HStack className="justify-end gap-2">
											<Button
												size="sm"
												variant="outline"
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
																showInBothLists: Boolean(tag.showInBothLists),
																iconFamily: tag.iconFamily ?? null,
																iconName: tag.iconName ?? null,
																iconStyle: tag.iconStyle ?? null,
															},
														},
													})
												}
											>
												<ButtonIcon as={EditIcon} />
												<ButtonText>Editar</ButtonText>
											</Button>
											<Button
												size="sm"
												variant="outline"
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
												<ButtonText>Excluir</ButtonText>
											</Button>
										</HStack>
									</VStack>,
									tag.id,
								),
						  )}
				</VStack>
			);
		}

		if (openDrawer === 'related-users') {
			if (isLoadingRelatedUsers) {
				return renderLoadingState();
			}

			if (!relatedUserData.length) {
				return renderEmptyState('Você ainda não vinculou nenhum usuário.');
			}

			return (
				<VStack className="gap-3">
					{relatedUserData.map(relatedUser =>
						renderCardContainer(
							<VStack className="gap-3">
								<VStack className="gap-1">
									<Text className={`${helperText} text-xs uppercase tracking-wide`}>Usuário vinculado</Text>
									<Text className="text-base font-semibold">{relatedUser.email || relatedUser.id}</Text>
								</VStack>
								<HStack className="justify-end">
									<Button
										size="sm"
										variant="outline"
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
										<ButtonText>Desvincular</ButtonText>
									</Button>
								</HStack>
							</VStack>,
							relatedUser.id,
						),
					)}
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
		tagFilter,
		filteredTags,
		relatedUserData,
		isLoadingRelatedUsers,
		isDarkMode,
		compactCardClassName,
		helperText,
		fieldContainerClassName,
		inputField,
		tintedCardClassName,
		skeletonBaseColor,
		skeletonHighlightColor,
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
							showInBothLists: Boolean(tag?.showInBothLists),
							iconFamily: typeof tag?.iconFamily === 'string' ? tag.iconFamily : null,
							iconName: typeof tag?.iconName === 'string' ? tag.iconName : null,
							iconStyle: typeof tag?.iconStyle === 'string' ? tag.iconStyle : null,
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

	const isInitialLoading = isAdminLoading;
	const managedRecordsCount = userData.length + bankData.length + tagData.length;
	const relatedUsersLabel = isLoadingRelatedUsers
		? 'Carregando vínculos...'
		: `${relatedUserData.length} usuário(s) vinculados`;

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<FloatingAlertViewport />

				<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
					<View className={`absolute top-0 left-0 right-0 ${cardBackground}`} style={{ height: heroHeight }}>
						<Image
							source={LoginWallpaper}
							alt="Background da tela de configurações"
							className="absolute h-full w-full rounded-b-3xl"
							resizeMode="cover"
						/>

						<VStack
							className="h-full w-full items-center justify-start gap-4 px-6"
							style={{ paddingTop: insets.top + 24 }}
						>
							<Heading size="xl" className="text-center text-white">
								Menu de Configurações
							</Heading>
							<ConfigurationIllustration width="38%" height="38%" className="opacity-90" />
						</VStack>
					</View>

					<ScrollView
						keyboardShouldPersistTaps="handled"
						keyboardDismissMode="on-drag"
						contentContainerStyle={{ paddingBottom: 48 }}
						nestedScrollEnabled
						showsVerticalScrollIndicator={false}
						className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
						style={{ marginTop: heroHeight - 64 }}
					>
						{isInitialLoading ? (
							<ConfigurationsSkeleton
								topSummaryCardClassName={topSummaryCardClassName}
								compactCardClassName={compactCardClassName}
								skeletonBaseColor={skeletonBaseColor}
								skeletonHighlightColor={skeletonHighlightColor}
								skeletonMutedBaseColor={skeletonMutedBaseColor}
								skeletonMutedHighlightColor={skeletonMutedHighlightColor}
							/>
						) : (
							<VStack className="mt-4 gap-4">
								<Box className={`${topSummaryCardClassName} px-5 py-5`}>
									<VStack className="gap-4">
										<VStack className="gap-2">
											<Text className={`${helperText} text-xs uppercase tracking-[0.18em]`}>
												Painel central
											</Text>
											<Heading size="md">Gerencie acessos, cadastros e preferências visuais do aplicativo</Heading>
											<Text className={`${bodyText} text-sm`}>
												O conteúdo abaixo mantém toda a lógica atual do sistema, mas reorganiza a leitura para deixar ações, listas e preferências mais diretas.
											</Text>
										</VStack>

										<View className="flex-row flex-wrap gap-3">
											<Box className={`${tintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
												<Text className={`${helperText} text-xs uppercase tracking-wide`}>Acesso</Text>
												<Text className="mt-2 text-lg font-semibold">
													{isAdmin ? 'Administrador' : 'Padrão'}
												</Text>
											</Box>
											<Box className={`${tintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
												<Text className={`${helperText} text-xs uppercase tracking-wide`}>Cadastros monitorados</Text>
												<Text className="mt-2 text-lg font-semibold">
													{isAdmin ? managedRecordsCount : relatedUserData.length}
												</Text>
											</Box>
										</View>

										<Box className={`${compactCardClassName} px-4 py-4`}>
											<VStack className="gap-3">
												<VStack className="gap-1">
													<Text className="font-semibold">Sessão atual</Text>
													<Text className={`${helperText} text-sm`}>
														Use este identificador para relacionar contas e validar permissões.
													</Text>
												</VStack>
												<Input isDisabled className={fieldContainerClassName}>
													<InputField
														value={
															currentUserEmail
																? `${currentUserEmail} (ID: ${userId})`
																: `Desconhecido (ID: ${userId})`
														}
														className={`${inputField} text-xs`}
													/>
												</Input>
												<Text className={`${helperText} text-xs`}>{relatedUsersLabel}</Text>
											</VStack>
										</Box>
									</VStack>
								</Box>

								<Accordion size="md" variant="unfilled" type="single" isCollapsible className="w-full gap-3">
									{accordionItems.map(item => {
										const requiresAdmin = item.actionRequiresAdmin !== false;

										return (
											<AccordionItem key={item.id} value={item.id} className={`${compactCardClassName} mb-3 overflow-hidden`}>
												<AccordionHeader>
													<AccordionTrigger className="px-4 py-4">
														{({ isExpanded }: { isExpanded: boolean }) => (
															<View className="flex-row items-center justify-between w-full">
																<AccordionTitleText className="pr-4 font-semibold leading-5">
																	{item.title}
																</AccordionTitleText>
																<AccordionIcon
																	as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
																	className={helperText}
																/>
															</View>
														)}
													</AccordionTrigger>
												</AccordionHeader>

												<AccordionContent className="px-4 pb-4 pt-0">
													<AccordionContentText className={`${helperText} text-sm`}>
														{item.content}
													</AccordionContentText>

													{requiresAdmin && !isAdmin ? (
														<Box className={`${tintedCardClassName} mt-4 px-4 py-4`}>
															<Text className={`${helperText} text-sm`}>
																Esta seção exibe informações administrativas apenas para usuários com essa permissão.
															</Text>
														</Box>
													) : null}

													{item.showUsersTable && isAdmin ? (
														<Box className={`${tintedCardClassName} mt-4 px-4 py-4`}>
															<VStack className="gap-3">
																<Text className={`${helperText} text-sm`}>
																	{userData.length > 0
																		? `${userData.length} usuário(s) cadastrados.`
																		: 'Nenhum usuário cadastrado até o momento.'}
																</Text>
																<Button size="sm" variant="outline" onPress={() => handleOpenDrawer('users')}>
																	<ButtonText>Visualizar usuários</ButtonText>
																</Button>
															</VStack>
														</Box>
													) : null}

													{item.showBanksTable && isAdmin ? (
														<Box className={`${tintedCardClassName} mt-4 px-4 py-4`}>
															<VStack className="gap-3">
																<Text className={`${helperText} text-sm`}>
																	{bankData.length > 0
																		? `${bankData.length} banco(s) cadastrados.`
																		: 'Nenhum banco cadastrado até o momento.'}
																</Text>
																<Button size="sm" variant="outline" onPress={() => handleOpenDrawer('banks')}>
																	<ButtonText>Visualizar bancos</ButtonText>
																</Button>
															</VStack>
														</Box>
													) : null}

													{item.showTagsTable && isAdmin ? (
														<Box className={`${tintedCardClassName} mt-4 px-4 py-4`}>
															<VStack className="gap-3">
																<Text className={`${helperText} text-sm`}>
																	{tagData.length > 0
																		? `${tagData.length} tag(s) cadastradas.`
																		: 'Nenhuma tag cadastrada até o momento.'}
																</Text>
																<Button size="sm" variant="outline" onPress={() => handleOpenDrawer('tags')}>
																	<ButtonText>Visualizar tags</ButtonText>
																</Button>
															</VStack>
														</Box>
													) : null}

													{item.showRelatedUsersTable ? (
														<Box className={`${tintedCardClassName} mt-4 px-4 py-4`}>
															<VStack className="gap-3">
																<Text className={`${helperText} text-sm`}>
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
																		<ButtonText>Visualizar vínculos</ButtonText>
																	)}
																</Button>
															</VStack>
														</Box>
													) : null}

													{item.showThemeSwitch ? (
														<Box className={`${tintedCardClassName} mt-4 px-4 py-4`}>
															<VStack className="gap-3">
																<HStack className="items-center justify-between gap-4">
																	<VStack className="flex-1 gap-1">
																		<Text className="text-base font-semibold">Modo escuro</Text>
																		<Text className={`${helperText} text-sm`}>
																			Alterne a aparência global do aplicativo.
																		</Text>
																	</VStack>
																	<Switch
																		value={isDarkMode}
																		onValueChange={handleToggleDarkMode}
																		disabled={isLoadingTheme}
																		trackColor={{ false: '#d4d4d4', true: '#525252' }}
																		thumbColor="#fafafa"
																		ios_backgroundColor="#d4d4d4"
																	/>
																</HStack>
																<Text className={`${helperText} text-xs`}>
																	{isLoadingTheme
																		? 'Carregando sua preferência de tema...'
																		: isDarkMode
																			? 'Modo escuro ativado.'
																			: 'Modo claro ativado.'}
																</Text>
															</VStack>
														</Box>
													) : null}

													{item.showValueVisibilitySwitch ? (
														<Box className={`${tintedCardClassName} mt-4 px-4 py-4`}>
															<VStack className="gap-3">
																<HStack className="items-center justify-between gap-4">
																	<VStack className="flex-1 gap-1">
																		<Text className="text-base font-semibold">Ocultar valores</Text>
																		<Text className={`${helperText} text-sm`}>
																			Esconda totais e saldos nas demais telas.
																		</Text>
																	</VStack>
																	<Switch
																		value={shouldHideValues}
																		onValueChange={handleToggleValueVisibility}
																		disabled={isLoadingPreference}
																		trackColor={{ false: '#d4d4d4', true: '#525252' }}
																		thumbColor="#fafafa"
																		ios_backgroundColor="#d4d4d4"
																	/>
																</HStack>
																<Text className={`${helperText} text-xs`}>
																	{isLoadingPreference
																		? 'Verificando a preferência salva...'
																		: shouldHideValues
																			? 'Os valores financeiros estão ocultos.'
																			: 'Os valores financeiros estão visíveis.'}
																</Text>
															</VStack>
														</Box>
													) : null}

													{item.action ? (
														<Button
															size="sm"
															className={`mt-4 ${submitButtonClassName}`}
															onPress={() => {
																router.push(item.action!.router);
															}}
														>
															<ButtonText>{item.action.label}</ButtonText>
														</Button>
													) : null}
												</AccordionContent>
											</AccordionItem>
										);
									})}
								</Accordion>
							</VStack>
						)}
					</ScrollView>
				</View>

				<Modal isOpen={isModalOpen} onClose={handleCloseActionModal}>
					<ModalBackdrop />
					<ModalContent className={`max-w-[360px] ${modalContentClassName}`}>
						<ModalHeader>
							<ModalTitle>{actionModalCopy.title}</ModalTitle>
							<ModalCloseButton onPress={handleCloseActionModal} />
						</ModalHeader>
						<ModalBody>
							<Text className={`${bodyText} text-sm`}>{actionModalCopy.message}</Text>
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
								className={actionModalCopy.isEdit ? submitButtonClassName : undefined}
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
					<DrawerContent className={drawerContentClassName}>
						<DrawerHeader className="flex-row items-start justify-between gap-3 px-6 pt-8">
							<Box className={`${drawerHeaderCardClassName} flex-1 px-4 py-4`}>
								<VStack className="gap-1">
									<Heading size="lg">{drawerCopy.title || 'Itens cadastrados'}</Heading>
									{drawerCopy.subtitle ? (
										<Text className={`${helperText} text-sm`}>{drawerCopy.subtitle}</Text>
									) : null}
								</VStack>
							</Box>
							<DrawerCloseButton onPress={handleCloseDrawer} />
						</DrawerHeader>
						<DrawerBody className="px-6">
							{drawerContent}
						</DrawerBody>
						<DrawerFooter />
					</DrawerContent>
				</Drawer>
			</View>
		</SafeAreaView>
	);
}
