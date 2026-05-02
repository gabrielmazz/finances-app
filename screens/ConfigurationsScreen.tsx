import React from 'react';
import { ScrollView, View, StatusBar, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

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
import { Button, ButtonText, ButtonSpinner, ButtonIcon } from '@/components/ui/button';
import { AddIcon, ChevronDownIcon, ChevronUpIcon, CopyIcon, EditIcon, TrashIcon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Image } from '@/components/ui/image';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Popover, PopoverBackdrop, PopoverBody, PopoverContent } from '@/components/ui/popover';
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
import {
	Table,
	TableBody,
	TableCaption,
	TableData,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';

// Importações relacionadas à navegação e autenticação
import { router, useFocusEffect } from 'expo-router';
import { auth } from '@/FirebaseConfig';

// Componentes do Uiverse
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';

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
import { BankIcon } from '@/hooks/useBankIcons';
import { TagIcon } from '@/hooks/useTagIcons';
import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import {
	getTagUsageTypeLabel,
	isTagVisibleInMandatoryUsageList,
	isTagVisibleInRegularUsageList,
	normalizeTagUsageType,
	type TagUsageType,
} from '@/utils/tagUsage';

// Importação do SVG
import ConfigurationIllustration from '../assets/UnDraw/configurationsScreen.svg';

import { Info, Tags as TagsIcon } from 'lucide-react-native';

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
		payload: { bank: { id: string; name: string; colorHex?: string | null; iconKey?: string | null } };
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
				usageType?: TagUsageType;
				isMandatoryExpense?: boolean;
				isMandatoryGain?: boolean;
				showInBothLists?: boolean;
				iconFamily?: TagIconFamily | null;
				iconName?: string | null;
				iconStyle?: TagIconStyle | null;
			};
		};
	};

type TablePaginationKey = 'users' | 'banks' | 'tags' | 'relatedUsers';

type PaginatedTableResult<T> = {
	items: T[];
	currentPage: number;
	totalPages: number;
	totalItems: number;
	startIndex: number;
	endIndex: number;
	hasPagination: boolean;
};

// Limite por página segue a convenção documentada em [[Configurações]].
const CONFIGURATIONS_TABLE_PAGE_SIZE = 5;

function paginateTableItems<T>(items: T[], requestedPage: number): PaginatedTableResult<T> {
	const totalItems = items.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / CONFIGURATIONS_TABLE_PAGE_SIZE));
	const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
	const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * CONFIGURATIONS_TABLE_PAGE_SIZE;
	const endIndex = totalItems === 0 ? 0 : Math.min(startIndex + CONFIGURATIONS_TABLE_PAGE_SIZE, totalItems);

	return {
		items: items.slice(startIndex, endIndex),
		currentPage,
		totalPages,
		totalItems,
		startIndex,
		endIndex,
		hasPagination: totalItems > CONFIGURATIONS_TABLE_PAGE_SIZE,
	};
}

function ConfigurationsSkeleton({
	topSummaryCardClassName,
	compactCardClassName,
	notTintedCardClassName,
	fieldContainerClassName,
	addTagButtonClassName,
	skeletonBaseColor,
	skeletonHighlightColor,
	skeletonMutedBaseColor,
	skeletonMutedHighlightColor,
}: {
	topSummaryCardClassName: string;
	compactCardClassName: string;
	notTintedCardClassName: string;
	fieldContainerClassName: string;
	addTagButtonClassName: string;
	skeletonBaseColor: string;
	skeletonHighlightColor: string;
	skeletonMutedBaseColor: string;
	skeletonMutedHighlightColor: string;
}) {
	const renderTableRow = ({
		key,
		actionCount,
		showColorIndicator = false,
		showTagIcon = false,
		showMetaLine = false,
	}: {
		key: string;
		actionCount: number;
		showColorIndicator?: boolean;
		showTagIcon?: boolean;
		showMetaLine?: boolean;
	}) => (
		<HStack key={key} className="items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
			<HStack className="min-w-0 flex-1 items-center gap-3">
				{showColorIndicator ? (
					<Skeleton
						className="h-3 w-3 rounded-full"
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
				) : null}
				{showTagIcon ? (
					<Skeleton
						className="h-11 w-11 rounded-2xl"
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
				) : null}
				<VStack className="min-w-0 flex-1 gap-2">
					<Skeleton
						className="h-4 w-40 max-w-full"
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
					{showMetaLine ? (
						<Skeleton
							className="h-3 w-32 max-w-full"
							baseColor={skeletonBaseColor}
							highlightColor={skeletonHighlightColor}
						/>
					) : null}
					<Skeleton
						className="h-3 w-28 max-w-full"
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
				</VStack>
			</HStack>
			<HStack className="items-center gap-2">
				{Array.from({ length: actionCount }).map((_, index) => (
					<Skeleton
						key={`${key}-action-${index}`}
						className="h-10 w-10 rounded-2xl"
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
				))}
			</HStack>
		</HStack>
	);

	const renderTableSection = ({
		titleWidthClassName,
		actionHeaderWidthClassName,
		actionCount,
		showColorIndicator = false,
		showTagIcon = false,
		showMetaLine = false,
		showFilter = false,
	}: {
		titleWidthClassName: string;
		actionHeaderWidthClassName: string;
		actionCount: number;
		showColorIndicator?: boolean;
		showTagIcon?: boolean;
		showMetaLine?: boolean;
		showFilter?: boolean;
	}) => (
		<VStack className="gap-3">
			<Skeleton
				className="h-10 rounded-2xl"
				baseColor={skeletonBaseColor}
				highlightColor={skeletonHighlightColor}
			/>

			{showFilter ? (
				<Box className={`${notTintedCardClassName} px-4 py-4`}>
					<VStack className="gap-2">
						<Skeleton
							className="h-4 w-36"
							baseColor={skeletonBaseColor}
							highlightColor={skeletonHighlightColor}
						/>
						<Skeleton
							className={`${fieldContainerClassName} w-full`}
							baseColor={skeletonBaseColor}
							highlightColor={skeletonHighlightColor}
						/>
					</VStack>
				</Box>
			) : null}

			<Box className={`${notTintedCardClassName} overflow-hidden`}>
				<HStack className="items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
					<Skeleton
						className={`h-4 ${titleWidthClassName}`}
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
					<Skeleton
						className={`h-4 ${actionHeaderWidthClassName}`}
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
				</HStack>
				{renderTableRow({
					key: `${titleWidthClassName}-row-1`,
					actionCount,
					showColorIndicator,
					showTagIcon,
					showMetaLine,
				})}
				{renderTableRow({
					key: `${titleWidthClassName}-row-2`,
					actionCount,
					showColorIndicator,
					showTagIcon,
					showMetaLine,
				})}
				<VStack className="gap-3 px-4 py-4">
					<Skeleton
						className="h-3 w-44"
						baseColor={skeletonBaseColor}
						highlightColor={skeletonHighlightColor}
					/>
					<HStack className="justify-center gap-2">
						<Skeleton
							className="h-8 w-8 rounded-2xl"
							baseColor={skeletonBaseColor}
							highlightColor={skeletonHighlightColor}
						/>
						<Skeleton
							className="h-8 w-8 rounded-2xl"
							baseColor={skeletonBaseColor}
							highlightColor={skeletonHighlightColor}
						/>
						<Skeleton
							className="h-8 w-8 rounded-2xl"
							baseColor={skeletonBaseColor}
							highlightColor={skeletonHighlightColor}
						/>
					</HStack>
				</VStack>
			</Box>
		</VStack>
	);

	const renderAccordionHeader = (titleWidthClassName: string) => (
		<HStack className="items-center justify-between gap-3 py-2">
			<Skeleton
				className={`h-5 ${titleWidthClassName} max-w-[85%]`}
				baseColor={skeletonBaseColor}
				highlightColor={skeletonHighlightColor}
			/>
			<Skeleton
				className="h-5 w-5 rounded-full"
				baseColor={skeletonBaseColor}
				highlightColor={skeletonHighlightColor}
			/>
		</HStack>
	);

	return (
		<VStack className="mt-4 gap-5">
			<VStack className="gap-4">
				<Skeleton
					className="h-5 w-44"
					baseColor={skeletonMutedBaseColor}
					highlightColor={skeletonMutedHighlightColor}
				/>

				<HStack className="gap-3">
					{Array.from({ length: 2 }).map((_, index) => (
						<Box
							key={`configurations-summary-skeleton-${index}`}
							className={`${notTintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}
						>
							<VStack className="gap-3">
								<Skeleton
									className="h-3 w-20"
									baseColor={skeletonMutedBaseColor}
									highlightColor={skeletonMutedHighlightColor}
								/>
								<Skeleton
									className="h-6 w-24"
									baseColor={skeletonMutedBaseColor}
									highlightColor={skeletonMutedHighlightColor}
								/>
							</VStack>
						</Box>
					))}
				</HStack>

				<VStack className="gap-3">
					<VStack className="gap-2">
						<Skeleton
							className="h-3 w-24"
							baseColor={skeletonMutedBaseColor}
							highlightColor={skeletonMutedHighlightColor}
						/>
						<Skeleton
							className={`${fieldContainerClassName} w-full`}
							baseColor={skeletonMutedBaseColor}
							highlightColor={skeletonMutedHighlightColor}
						/>
					</VStack>

					<HStack className="items-end gap-3">
						<VStack className="flex-1 gap-2">
							<Skeleton
								className="h-3 w-24"
								baseColor={skeletonMutedBaseColor}
								highlightColor={skeletonMutedHighlightColor}
							/>
							<Skeleton
								className={`${fieldContainerClassName} w-full`}
								baseColor={skeletonMutedBaseColor}
								highlightColor={skeletonMutedHighlightColor}
							/>
						</VStack>
						<Skeleton
							className={addTagButtonClassName}
							baseColor={skeletonMutedBaseColor}
							highlightColor={skeletonMutedHighlightColor}
						/>
					</HStack>
				</VStack>
			</VStack>

			<VStack className="gap-4">
				<Skeleton
					className="h-5 w-56"
					baseColor={skeletonMutedBaseColor}
					highlightColor={skeletonMutedHighlightColor}
				/>

				<VStack className="gap-4">
					<Box className={`${compactCardClassName} px-0 py-1`}>
						<VStack className="gap-3">
							{renderAccordionHeader('w-[78%]')}
							{renderTableSection({
								titleWidthClassName: 'w-20',
								actionHeaderWidthClassName: 'w-12',
								actionCount: 1,
							})}
						</VStack>
					</Box>

					<Box className={`${compactCardClassName} px-0 py-1`}>
						<VStack className="gap-3">
							{renderAccordionHeader('w-[74%]')}
							{renderTableSection({
								titleWidthClassName: 'w-16',
								actionHeaderWidthClassName: 'w-16',
								actionCount: 2,
								showColorIndicator: true,
							})}
						</VStack>
					</Box>

					<Box className={`${compactCardClassName} px-0 py-1`}>
						<VStack className="gap-3">
							{renderAccordionHeader('w-[70%]')}
							{renderTableSection({
								titleWidthClassName: 'w-12',
								actionHeaderWidthClassName: 'w-16',
								actionCount: 2,
								showTagIcon: true,
								showMetaLine: true,
								showFilter: true,
							})}
						</VStack>
					</Box>

					<Box className={`${compactCardClassName} px-0 py-1`}>
						<VStack className="gap-3">
							{renderAccordionHeader('w-[76%]')}
							{renderTableSection({
								titleWidthClassName: 'w-28',
								actionHeaderWidthClassName: 'w-12',
								actionCount: 1,
							})}
						</VStack>
					</Box>

					<Box className={`${compactCardClassName} px-0 py-1`}>
						<VStack className="gap-3">
							{renderAccordionHeader('w-[58%]')}
							<Box className={`${notTintedCardClassName} px-4 py-4`}>
								<HStack className="items-center justify-between gap-4">
									<HStack className="min-w-0 flex-1 items-center gap-2">
										<Skeleton
											className="h-4 w-28"
											baseColor={skeletonBaseColor}
											highlightColor={skeletonHighlightColor}
										/>
										<Skeleton
											className="h-4 w-4 rounded-full"
											baseColor={skeletonBaseColor}
											highlightColor={skeletonHighlightColor}
										/>
									</HStack>
									<Skeleton
										className="h-7 w-12 rounded-full"
										baseColor={skeletonBaseColor}
										highlightColor={skeletonHighlightColor}
									/>
								</HStack>
							</Box>
						</VStack>
					</Box>

					<Box className={`${compactCardClassName} px-0 py-1`}>
						<VStack className="gap-3">
							{renderAccordionHeader('w-[48%]')}
							<Box className={`${notTintedCardClassName} px-4 py-4`}>
								<HStack className="items-center justify-between gap-4">
									<HStack className="min-w-0 flex-1 items-center gap-2">
										<Skeleton
											className="h-4 w-24"
											baseColor={skeletonBaseColor}
											highlightColor={skeletonHighlightColor}
										/>
										<Skeleton
											className="h-4 w-4 rounded-full"
											baseColor={skeletonBaseColor}
											highlightColor={skeletonHighlightColor}
										/>
									</HStack>
									<Skeleton
										className="h-7 w-12 rounded-full"
										baseColor={skeletonBaseColor}
										highlightColor={skeletonHighlightColor}
									/>
								</HStack>
							</Box>
						</VStack>
					</Box>
				</VStack>
			</VStack>
		</VStack>
	);
}

type ConfigurationActionButtonProps = {
	label?: string;
	icon: React.ElementType;
	iconClassName?: string;
	onPress: () => void;
	disabled?: boolean;
	variant?: 'solid' | 'outline' | 'link';
	action?: 'primary' | 'secondary' | 'positive' | 'negative' | 'default';
	size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
	className?: string;
	isLoading?: boolean;
	spinnerColor?: string;
	accessibilityLabel?: string;
	accessibilityHint?: string;
};

// Segue o padrão visual documentado em [[Configurações]] e [[Sistema de Temas]].
function ConfigurationActionButton({
	label,
	icon,
	iconClassName,
	onPress,
	disabled = false,
	variant = 'outline',
	action = 'primary',
	size = 'sm',
	className,
	isLoading = false,
	spinnerColor,
	accessibilityLabel,
	accessibilityHint,
}: ConfigurationActionButtonProps) {
	return (
		<Button
			size={size}
			variant={variant}
			action={action}
			onPress={onPress}
			isDisabled={disabled}
			className={className}
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityHint={accessibilityHint}
		>
			{isLoading ? (
				<ButtonSpinner color={spinnerColor} />
			) : (
				<>
					<ButtonIcon as={icon} size={size} className={iconClassName} />
					{label ? <ButtonText>{label}</ButtonText> : null}
				</>
			)}
		</Button>
	);
}

function ActionButtonsRow({
	children,
	align = 'flex-end',
}: {
	children: React.ReactNode;
	align?: 'flex-start' | 'center' | 'flex-end';
}) {
	const justifyClassName =
		align === 'flex-start' ? 'justify-start' : align === 'center' ? 'justify-center' : 'justify-end';

	return (
		<HStack className={`flex-wrap items-center gap-2 ${justifyClassName}`}>
			{children}
		</HStack>
	);
}

function TableActionsHeader({
	widthClassName,
	headerClassName,
	textClassName,
}: {
	widthClassName: string;
	headerClassName: string;
	textClassName: string;
}) {
	return (
		<TableHead useRNView className={`${widthClassName} ${headerClassName}`}>
			<Text className={textClassName}>Ações</Text>
		</TableHead>
	);
}

function TableActionsCell({
	widthClassName,
	cellClassName,
	children,
}: {
	widthClassName: string;
	cellClassName: string;
	children: React.ReactNode;
}) {
	return (
		<TableData useRNView className={`${widthClassName} ${cellClassName}`}>
			<ActionButtonsRow align="center">{children}</ActionButtonsRow>
		</TableData>
	);
}

function TablePaginationControls({
	pagination,
	onPageChange,
	containerClassName,
	listClassName,
	buttonClassName,
	activeButtonClassName,
	infoTextClassName,
}: {
	pagination: PaginatedTableResult<unknown>;
	onPageChange: (page: number) => void;
	containerClassName: string;
	listClassName: string;
	buttonClassName: string;
	activeButtonClassName: string;
	infoTextClassName: string;
}) {
	if (!pagination.hasPagination) {
		return null;
	}

	const pages = Array.from({ length: pagination.totalPages }, (_, index) => index + 1);

	return (
		<VStack className={containerClassName}>
			<HStack className={listClassName}>
				{pages.map(page => {
					const isActive = page === pagination.currentPage;

					return (
						<Button
							key={`table-pagination-page-${page}`}
							size="sm"
							variant={isActive ? 'solid' : 'outline'}
							action={isActive ? 'primary' : 'secondary'}
							className={isActive ? activeButtonClassName : buttonClassName}
							onPress={() => onPageChange(page)}
						>
							<ButtonText>{page}</ButtonText>
						</Button>
					);
				})}
			</HStack>
			<Text className={infoTextClassName}>
				Mostrando {pagination.startIndex + 1}-{pagination.endIndex} de {pagination.totalItems}
			</Text>
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

	return result;

}

export async function handleDeleteBank(bankId: string) {

	const result = await deleteBankFirebase(bankId);

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
		addTagButtonClassName,
		compactCardClassName,
		tintedCardClassName,
		notTintedCardClassName,
		topSummaryCardClassName,
		submitButtonClassName,
		accordionSectionButtonClassName,
		submitButtonCancelClassName,
		modalContentClassName,
		tableBaseClassName,
		tableHeaderRowClassName,
		tableRowClassName,
		tableHeadTextClassName,
		tableActionsHeaderTextClassName,
		tableContentCellClassName,
		tableCaptionClassName,
		tableActionsHeaderClassName,
		tableActionsCellClassName,
		tableSingleActionColumnClassName,
		tableDoubleActionColumnClassName,
		tableUsersMinWidthClassName,
		tableBanksMinWidthClassName,
		tableTagsMinWidthClassName,
		tableRelatedUsersMinWidthClassName,
		tableIconButtonClassName,
		tablePrimaryIconClassName,
		tablePaginationContainerClassName,
		tablePaginationListClassName,
		tablePaginationButtonClassName,
		tablePaginationActiveButtonClassName,
		tablePaginationInfoTextClassName,
		heroHeight,
		insets,
		skeletonBaseColor,
		skeletonHighlightColor,
		skeletonMutedBaseColor,
		skeletonMutedHighlightColor,
		infoCardStyle,
		switchTrackColor,
		switchThumbColor,
		switchIosBackgroundColor,
	} = useScreenStyles();

	const [userData, setUserData] = React.useState<Array<{ id: string; email: string }>>([]);
	const [bankData, setBankData] = React.useState<Array<{ id: string; name: string; colorHex?: string | null; iconKey?: string | null }>>([]);
	const [tagData, setTagData] = React.useState<
		Array<{
			id: string;
			name: string;
			usageType?: TagUsageType;
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
	const [isCopyingUserId, setIsCopyingUserId] = React.useState(false);
	const [tablePages, setTablePages] = React.useState<Record<TablePaginationKey, number>>({
		users: 1,
		banks: 1,
		tags: 1,
		relatedUsers: 1,
	});
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

	const themePopoverText =
		'Aplica o modo claro ou escuro em toda a interface do app e mantém a preferência salva para as próximas sessões.';
	const themeStatusText = isLoadingTheme
		? 'Carregando sua preferência de tema...'
		: isDarkMode
			? 'Modo escuro ativado.'
			: 'Modo claro ativado.';

	// O toggle segue a padronização visual descrita em [[Configurações]] e o fluxo de [[Privacidade de Valores]].
	const valueVisibilityPopoverText =
		'Oculta saldos, totais e outros valores monetários nas telas do app. A preferência fica salva para as próximas sessões, mas a ocultação é apenas visual.';
	const valueVisibilityStatusText = isLoadingPreference
		? 'Verificando a preferência salva...'
		: shouldHideValues
			? 'Os valores financeiros estão ocultos.'
			: 'Os valores financeiros estão visíveis.';

	const filteredTags = React.useMemo(() => {
		return tagData.filter(tag => {
			if (tagFilter === 'all') {
				return true;
			}
			if (tagFilter === 'expense') {
				return isTagVisibleInRegularUsageList(tag, 'expense');
			}
			if (tagFilter === 'mandatory-expense') {
				return isTagVisibleInMandatoryUsageList(tag, 'expense');
			}
			if (tagFilter === 'gain') {
				return isTagVisibleInRegularUsageList(tag, 'gain');
			}
			if (tagFilter === 'mandatory-gain') {
				return isTagVisibleInMandatoryUsageList(tag, 'gain');
			}
			return true;
		});
	}, [tagData, tagFilter]);

	const usersTable = React.useMemo(
		() => paginateTableItems(userData, tablePages.users),
		[userData, tablePages.users],
	);

	const banksTable = React.useMemo(
		() => paginateTableItems(bankData, tablePages.banks),
		[bankData, tablePages.banks],
	);

	const tagsTable = React.useMemo(
		() => paginateTableItems(filteredTags, tablePages.tags),
		[filteredTags, tablePages.tags],
	);

	const relatedUsersTable = React.useMemo(
		() => paginateTableItems(relatedUserData, tablePages.relatedUsers),
		[relatedUserData, tablePages.relatedUsers],
	);

	// Esta tela usa notifier-alert para feedback in-app, conforme [[Notificações]].
	const showConfigurationAlert = React.useCallback(
		({
			title,
			description,
			type,
			duration = 4000,
		}: {
			title: string;
			description: string;
			type: 'error' | 'warn' | 'info' | 'success';
			duration?: number;
		}) => {
			showNotifierAlert({
				title,
				description,
				type,
				isDarkMode,
				duration,
			});
		},
		[isDarkMode],
	);

	const handleTablePageChange = React.useCallback((tableKey: TablePaginationKey, page: number) => {
		setTablePages(previousPages =>
			previousPages[tableKey] === page
				? previousPages
				: {
					...previousPages,
					[tableKey]: page,
				},
		);
	}, []);

	React.useEffect(() => {
		setTablePages(previousPages => {
			const normalizedPages = {
				users: usersTable.currentPage,
				banks: banksTable.currentPage,
				tags: tagsTable.currentPage,
				relatedUsers: relatedUsersTable.currentPage,
			};

			if (
				previousPages.users === normalizedPages.users &&
				previousPages.banks === normalizedPages.banks &&
				previousPages.tags === normalizedPages.tags &&
				previousPages.relatedUsers === normalizedPages.relatedUsers
			) {
				return previousPages;
			}

			return normalizedPages;
		});
	}, [
		usersTable.currentPage,
		banksTable.currentPage,
		tagsTable.currentPage,
		relatedUsersTable.currentPage,
	]);

	React.useEffect(() => {
		setTablePages(previousPages =>
			previousPages.tags === 1
				? previousPages
				: {
					...previousPages,
					tags: 1,
				},
		);
	}, [tagFilter]);

	// Constante para armazenar o email do usuário logado atualmente
	const [currentUserEmail, setCurrentUserEmail] = React.useState<string>('');

	const handleCopyUserId = React.useCallback(async () => {
		if (!userId) {
			showConfigurationAlert({
				title: 'ID indisponível',
				description: 'Nenhum ID de usuário foi encontrado para copiar.',
				type: 'warn',
			});
			return;
		}

		setIsCopyingUserId(true);

		try {
			await Clipboard.setStringAsync(userId);
			showConfigurationAlert({
				title: 'ID copiado',
				description: 'ID do usuário copiado com sucesso.',
				type: 'success',
			});
		} catch (error) {
			console.error('Erro ao copiar ID do usuário:', error);
			showConfigurationAlert({
				title: 'Erro ao copiar ID',
				description: 'Não foi possível copiar o ID do usuário.',
				type: 'error',
			});
		} finally {
			setIsCopyingUserId(false);
		}
	}, [showConfigurationAlert, userId]);

	const handleUserRemoval = React.useCallback(
		async (targetUserId: string, identifier: string) => {
			if (!isAdmin) {
				showConfigurationAlert({
					title: 'Ação não permitida',
					description: 'Somente administradores podem excluir usuários por esta tela.',
					type: 'error',
				});
				return;
			}

			if (!targetUserId || targetUserId === userId) {
				showConfigurationAlert({
					title: 'Ação bloqueada',
					description: 'Não é permitido excluir a própria conta por esta tela.',
					type: 'warn',
				});
				return;
			}

			const result = await handleDeleteUser(targetUserId);

			if (result.success) {
				setUserData(prev => prev.filter(user => user.id !== targetUserId));
				showConfigurationAlert({
					title: 'Usuário removido',
					description: `Usuário ${identifier} foi excluído.`,
					type: 'success',
				});
			} else {
				showConfigurationAlert({
					title: 'Erro ao remover usuário',
					description: 'Não foi possível remover o usuário. Tente novamente.',
					type: 'error',
				});
			}
		},
		[isAdmin, showConfigurationAlert, userId],
	);

	const handleBankRemoval = React.useCallback(
		async (bankId: string, bankName: string) => {
			const result = await handleDeleteBank(bankId);

			if (result.success) {
				setBankData(prev => prev.filter(bank => bank.id !== bankId));
				showConfigurationAlert({
					title: 'Banco removido',
					description: `Banco ${bankName || bankId} foi excluído.`,
					type: 'success',
				});
			} else {
				showConfigurationAlert({
					title: 'Erro ao remover banco',
					description: 'Não foi possível remover o banco. Tente novamente.',
					type: 'error',
				});
			}
		},
		[showConfigurationAlert],
	);

	const handleBankEdit = React.useCallback(
		(bank: { id: string; name: string; colorHex?: string | null; iconKey?: string | null }) => {
			if (!bank?.id) {
				return;
			}

			const encodedName = encodeURIComponent(bank?.name ?? '');
			const encodedColor = bank?.colorHex ? encodeURIComponent(bank.colorHex) : undefined;
			const encodedIconKey = bank?.iconKey ? encodeURIComponent(bank.iconKey) : undefined;

			router.push({
				pathname: '/add-register-bank',
				params: {
					bankId: bank.id,
					bankName: encodedName,
					...(encodedColor ? { colorHex: encodedColor } : {}),
					...(encodedIconKey ? { bankIconKey: encodedIconKey } : {}),
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
				showConfigurationAlert({
					title: 'Tag removida',
					description: `Tag ${tagName || tagId} foi excluída.`,
					type: 'success',
				});
			} else {
				showConfigurationAlert({
					title: 'Erro ao remover tag',
					description: 'Não foi possível remover a tag. Tente novamente.',
					type: 'error',
				});
			}
		},
		[setTagData, showConfigurationAlert],
	);

	const handleRelatedUserRemoval = React.useCallback(
		async (relatedUserId: string, identifier: string) => {
			const result = await deleteUserRelationFirebase(relatedUserId);

			if (result.success) {
				setRelatedUserData(prev => prev.filter(user => user.id !== relatedUserId));
				showConfigurationAlert({
					title: 'Vínculo removido',
					description: `Usuário ${identifier} foi desvinculado.`,
					type: 'success',
				});
			} else {
				showConfigurationAlert({
					title: 'Erro ao remover vínculo',
					description: 'Não foi possível remover o vínculo. Tente novamente.',
					type: 'error',
				});
			}
		},
		[setRelatedUserData, showConfigurationAlert],
	);

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

	const getTagTypeLabel = React.useCallback((tag: (typeof tagData)[number]) => {
		return getTagUsageTypeLabel(tag.usageType);
	}, []);

	const getTagBadgeLabels = React.useCallback(
		(tag: (typeof tagData)[number]) => {
			const badges = [getTagTypeLabel(tag)];

			if (tag.isMandatoryExpense) {
				badges.push('Despesa obrigatória');
			}

			if (tag.isMandatoryGain) {
				badges.push('Ganho obrigatório');
			}

			if (tag.showInBothLists) {
				badges.push(tag.usageType === 'both' ? 'Tambem nos obrigatorios' : 'Listas normal e obrigatoria');
			}

			return badges;
		},
		[getTagTypeLabel],
	);

	const renderEmptyTableState = React.useCallback(
		(message: string) => (
			<Box className={`${tintedCardClassName} mt-4 px-4 py-5`}>
				<Text className={`${helperText} text-sm`}>{message}</Text>
			</Box>
		),
		[helperText, tintedCardClassName],
	);

	const renderSectionAction = React.useCallback(
		(action: AccordionItem['action'] | undefined, disabled = false) => {
			if (!action) {
				return null;
			}

			return (
				<Box className="w-full">
					<ConfigurationActionButton
						label={action.label}
						icon={AddIcon}
						onPress={() => router.push(action.router)}
						disabled={disabled}
						size="md"
						variant="solid"
						className={accordionSectionButtonClassName}
					/>
				</Box>
			);
		},
		[accordionSectionButtonClassName],
	);

	const renderTablePagination = React.useCallback(
		(tableKey: TablePaginationKey, pagination: PaginatedTableResult<unknown>) => (
			<TablePaginationControls
				pagination={pagination}
				onPageChange={page => handleTablePageChange(tableKey, page)}
				containerClassName={tablePaginationContainerClassName}
				listClassName={tablePaginationListClassName}
				buttonClassName={tablePaginationButtonClassName}
				activeButtonClassName={tablePaginationActiveButtonClassName}
				infoTextClassName={tablePaginationInfoTextClassName}
			/>
		),
		[
			handleTablePageChange,
			tablePaginationActiveButtonClassName,
			tablePaginationButtonClassName,
			tablePaginationContainerClassName,
			tablePaginationInfoTextClassName,
			tablePaginationListClassName,
		],
	);

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
							iconKey: typeof bank?.iconKey === 'string' ? bank.iconKey : null,
						}));

						setBankData(formattedBanks);
					}
				});

				fetchAllTags().then((tags) => {

					if (isMounted && tags) {
						const formattedTags = tags.map((tag: any) => ({
							id: tag.id,
							name: tag.name,
							usageType: normalizeTagUsageType(tag?.usageType),
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

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
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
								notTintedCardClassName={notTintedCardClassName}
								fieldContainerClassName={fieldContainerClassName}
								addTagButtonClassName={addTagButtonClassName}
								skeletonBaseColor={skeletonBaseColor}
								skeletonHighlightColor={skeletonHighlightColor}
								skeletonMutedBaseColor={skeletonMutedBaseColor}
								skeletonMutedHighlightColor={skeletonMutedHighlightColor}
							/>
						) : (

							<VStack className="mt-4 gap-4">

								<Heading
									className="text-lg uppercase tracking-widest "
									size="lg"
								>
									Informações do usuário
								</Heading>

								<View className="flex-row flex-wrap gap-3">
									<Box className={`${notTintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
										<Text className={`${helperText} text-xs uppercase tracking-wide`}>Acesso</Text>
										<Text className="mt-2 text-lg font-semibold">
											{isAdmin ? 'Administrador' : 'Padrão'}
										</Text>
									</Box>
									<Box className={`${notTintedCardClassName} min-w-[145px] flex-1 px-4 py-4`}>
										<Text className={`${helperText} text-xs uppercase tracking-wide`}>Cadastros monitorados</Text>
										<Text className="mt-2 text-lg font-semibold">
											{isAdmin ? managedRecordsCount : relatedUserData.length}
										</Text>
									</Box>
								</View>

								<VStack className="gap-4">

									<VStack className="gap-3">

										<VStack className="gap-2">
											<Text className={`${bodyText} ml-1 text-sm`}>Email logado</Text>
											<Input className={fieldContainerClassName} isDisabled>
												<InputField
													placeholder="Email do usuário"
													value={currentUserEmail}
													keyboardType="numeric"
													returnKeyType="next"
													className={inputField}
												/>
											</Input>
										</VStack>

										<HStack className="items-end gap-3">
											<VStack className="flex-1 gap-2">
												<Text className={`${bodyText} ml-1 text-sm`}>ID do usuário</Text>
												<View className="flex-1">
													<Input className={fieldContainerClassName} isDisabled>
														<InputField
															placeholder="ID do usuário"
															value={userId || 'ID indisponível'}
															keyboardType="numeric"
															returnKeyType="next"
															className={inputField}
														/>
													</Input>
												</View>
											</VStack>
											<ConfigurationActionButton
												icon={CopyIcon}
												iconClassName={tablePrimaryIconClassName}
												onPress={() => {
													void handleCopyUserId();
												}}
												disabled={!userId || isCopyingUserId}
												accessibilityLabel="Copiar ID do usuário"
												accessibilityHint="Copia o ID do usuário logado para a área de transferência"
												className={addTagButtonClassName}
												isLoading={isCopyingUserId}
												spinnerColor={isDarkMode ? '#FCD34D' : '#F59E0B'}
											/>
										</HStack>
									</VStack>
								</VStack>

								<Heading
									className="text-lg uppercase tracking-widest "
									size="lg"
								>
									Configurações avançadas
								</Heading>

								<Accordion size="md" variant="unfilled" type="single" isCollapsible className="w-full">
									{accordionItems.map(item => {
										const requiresAdmin = item.actionRequiresAdmin !== false;
										const canAccessSection = !requiresAdmin || isAdmin;

										return (
											<AccordionItem key={item.id} value={item.id} className={``}>
												<AccordionHeader>
													<AccordionTrigger className="px-0">
														{({ isExpanded }: { isExpanded: boolean }) => (
															<View className="flex-row items-center justify-between w-full">
																<AccordionTitleText className="font-semibold leading-5">
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

												<AccordionContent className="px-0">

													{!canAccessSection ? (
														<Box className={`${notTintedCardClassName} mt-4 px-4 py-4`}>
															<Text className={`${helperText} text-sm`}>
																Esta seção exibe informações administrativas apenas para usuários com essa permissão.
															</Text>
														</Box>
													) : null}

													{item.showUsersTable && canAccessSection ? (
														<VStack className="gap-3">
															{renderSectionAction(item.action)}
															{usersTable.totalItems > 0 ? (
																<Box className={`${notTintedCardClassName} overflow-hidden`}>
																	<Table className={`${tableBaseClassName} ${tableUsersMinWidthClassName}`}>
																		<TableHeader>
																			<TableRow className={tableHeaderRowClassName}>
																				<TableHead className={tableHeadTextClassName}>Usuário</TableHead>
																				<TableActionsHeader
																					widthClassName={tableSingleActionColumnClassName}
																					headerClassName={tableActionsHeaderClassName}
																					textClassName={tableActionsHeaderTextClassName}
																				/>
																			</TableRow>
																		</TableHeader>
																			<TableBody>
																				{usersTable.items.map(user => (
																					(() => {
																						const isCurrentLoggedUser = user.id === userId;
																						return (
																					<TableRow
																						key={user.id}
																						className={tableRowClassName}
																					>
																						<TableData useRNView className={tableContentCellClassName}>
																							<VStack className="min-w-0 flex-1 gap-1">
																								<Text className="text-sm font-semibold" numberOfLines={1}>
																									{user.email || 'Usuário sem e-mail'}
																								</Text>
																								<Text className={`${helperText} text-xs`} numberOfLines={1} ellipsizeMode="middle">
																									ID: {user.id}
																								</Text>
																								{isCurrentLoggedUser ? (
																									<Text className={`${helperText} text-[11px]`}>
																										Conta atual
																									</Text>
																								) : null}
																							</VStack>
																						</TableData>
																						<TableActionsCell
																							widthClassName={tableSingleActionColumnClassName}
																							cellClassName={tableActionsCellClassName}
																						>
																							<ConfigurationActionButton
																								icon={TrashIcon}
																								variant="link"
																								className={tableIconButtonClassName}
																								action="negative"
																								accessibilityLabel={`Excluir usuário ${user.email ?? user.id}`}
																								disabled={!isAdmin || isCurrentLoggedUser}
																								onPress={() =>
																									setPendingAction({
																										type: 'delete-user',
																									payload: {
																										userId: user.id,
																										identifier: user.email ?? user.id,
																										},
																									})
																								}
																							/>
																						</TableActionsCell>
																					</TableRow>
																						);
																					})()
																				))}
																		</TableBody>
																		<TableCaption className={tableCaptionClassName}>
																			{usersTable.totalItems} usuário(s) cadastrados.
																		</TableCaption>
																	</Table>
																	{renderTablePagination('users', usersTable)}
																</Box>
															) : (
																renderEmptyTableState('Nenhum usuário cadastrado até o momento.')
															)}
														</VStack>
													) : null}

													{item.showBanksTable && canAccessSection ? (
														<VStack className="gap-3">
															{renderSectionAction(item.action)}
															{banksTable.totalItems > 0 ? (
																<Box className={`${notTintedCardClassName} overflow-hidden`}>
																	<Table className={`${tableBaseClassName} ${tableBanksMinWidthClassName}`}>
																		<TableHeader>
																			<TableRow className={tableHeaderRowClassName}>
																				<TableHead className={tableHeadTextClassName}>Banco</TableHead>
																				<TableActionsHeader
																					widthClassName={tableDoubleActionColumnClassName}
																					headerClassName={tableActionsHeaderClassName}
																					textClassName={tableActionsHeaderTextClassName}
																				/>
																			</TableRow>
																		</TableHeader>
																		<TableBody>
																			{banksTable.items.map(bank => (
																				<TableRow
																					key={bank.id}
																					className={tableRowClassName}
																				>
																					<TableData useRNView className={tableContentCellClassName}>
																						<HStack className="min-w-0 items-center gap-3">
																							<BankIcon
																								iconKey={bank.iconKey}
																								name={bank.name}
																								colorHex={bank.colorHex}
																								size={30}
																							/>
																							<VStack className="min-w-0 flex-1 gap-1">
																								<Text className="text-sm font-semibold" numberOfLines={1}>
																									{bank.name}
																								</Text>
																								<Text className={`${helperText} text-xs`} numberOfLines={1} ellipsizeMode="middle">
																									ID: {bank.id}
																								</Text>
																							</VStack>
																						</HStack>
																					</TableData>
																					<TableActionsCell
																						widthClassName={tableDoubleActionColumnClassName}
																						cellClassName={tableActionsCellClassName}
																					>
																						<ConfigurationActionButton
																							icon={EditIcon}
																							variant="link"
																							action="default"
																							className={tableIconButtonClassName}
																							iconClassName={tablePrimaryIconClassName}
																							accessibilityLabel={`Editar banco ${bank.name}`}
																							onPress={() =>
																								setPendingAction({
																									type: 'edit-bank',
																									payload: { bank },
																								})
																							}
																						/>
																						<ConfigurationActionButton
																							icon={TrashIcon}
																							variant="link"
																							className={tableIconButtonClassName}
																							action="negative"
																							accessibilityLabel={`Excluir banco ${bank.name}`}
																							onPress={() =>
																								setPendingAction({
																									type: 'delete-bank',
																									payload: {
																										bankId: bank.id,
																										bankName: bank.name,
																									},
																								})
																							}
																						/>
																					</TableActionsCell>
																				</TableRow>
																			))}
																		</TableBody>
																		<TableCaption className={tableCaptionClassName}>
																			{banksTable.totalItems} banco(s) cadastrados.
																		</TableCaption>
																	</Table>
																	{renderTablePagination('banks', banksTable)}
																</Box>
															) : (
																renderEmptyTableState('Nenhum banco cadastrado até o momento.')
															)}
														</VStack>
													) : null}

													{item.showTagsTable && canAccessSection ? (
														<VStack className="gap-3">
															{renderSectionAction(item.action)}
															<Box className={`${notTintedCardClassName} px-4 py-4`}>
																<VStack className="gap-2">
																	<Text className="text-sm font-semibold">Filtrar tags por tipo</Text>
																	<Select selectedValue={tagFilter} onValueChange={value => setTagFilter(value as typeof tagFilter)}>
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
																</VStack>
															</Box>
															{tagsTable.totalItems > 0 ? (
																<Box className={`${notTintedCardClassName} overflow-hidden`}>
																	<Table className={`${tableBaseClassName} ${tableTagsMinWidthClassName}`}>
																		<TableHeader>
																			<TableRow className={tableHeaderRowClassName}>
																				<TableHead className={tableHeadTextClassName}>Tag</TableHead>
																				<TableActionsHeader
																					widthClassName={tableDoubleActionColumnClassName}
																					headerClassName={tableActionsHeaderClassName}
																					textClassName={tableActionsHeaderTextClassName}
																				/>
																			</TableRow>
																		</TableHeader>
																		<TableBody>
																			{tagsTable.items.map(tag => (
																				<TableRow
																					key={tag.id}
																					className={tableRowClassName}
																				>
																					<TableData useRNView className={tableContentCellClassName}>
																						<HStack className="min-w-0 items-start gap-3">
																							<View className={`${notTintedCardClassName} h-11 w-11 items-center justify-center`}>
																								<TagIcon
																									iconFamily={tag.iconFamily}
																									iconName={tag.iconName}
																									iconStyle={tag.iconStyle}
																									size={20}
																									color={isDarkMode ? '#FCD34D' : '#D97706'}
																								/>
																							</View>
																							<VStack className="min-w-0 flex-1 gap-1">
																								<Text className="text-sm font-semibold" numberOfLines={1}>
																									{tag.name}
																								</Text>
																								<Text className={`${helperText} text-xs`} numberOfLines={2}>
																									{getTagBadgeLabels(tag).join(' • ')}
																								</Text>
																								<Text className={`${helperText} text-xs`} numberOfLines={1} ellipsizeMode="middle">
																									ID: {tag.id}
																								</Text>
																							</VStack>
																						</HStack>
																					</TableData>
																					<TableActionsCell
																						widthClassName={tableDoubleActionColumnClassName}
																						cellClassName={tableActionsCellClassName}
																					>
																						<ConfigurationActionButton
																							icon={EditIcon}
																							variant="link"
																							action="default"
																							className={tableIconButtonClassName}
																							iconClassName={tablePrimaryIconClassName}
																							accessibilityLabel={`Editar tag ${tag.name}`}
																							onPress={() =>
																								setPendingAction({
																									type: 'edit-tag',
																									payload: {
																										tag: {
																											id: tag.id,
																											name: tag.name,
																											usageType: normalizeTagUsageType(tag.usageType),
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
																						/>
																						<ConfigurationActionButton
																							icon={TrashIcon}
																							variant="link"
																							className={tableIconButtonClassName}
																							action="negative"
																							accessibilityLabel={`Excluir tag ${tag.name}`}
																							onPress={() =>
																								setPendingAction({
																									type: 'delete-tag',
																									payload: {
																										tagId: tag.id,
																										tagName: tag.name,
																									},
																								})
																							}
																						/>
																					</TableActionsCell>
																				</TableRow>
																			))}
																		</TableBody>
																		<TableCaption className={tableCaptionClassName}>
																			{tagsTable.totalItems} tag(s) encontradas para o filtro atual.
																		</TableCaption>
																	</Table>
																	{renderTablePagination('tags', tagsTable)}
																</Box>
															) : (
																renderEmptyTableState('Nenhuma tag encontrada para o filtro selecionado.')
															)}
														</VStack>
													) : null}

													{item.showRelatedUsersTable && canAccessSection ? (
														<VStack className="gap-3">
															{renderSectionAction(item.action)}
															{isLoadingRelatedUsers ? (
																<Box className={`${notTintedCardClassName} px-4 py-4`}>
																	<HStack className="items-center gap-3">
																		<ButtonSpinner />
																		<Text className={`${helperText} text-sm`}>Carregando usuários vinculados...</Text>
																	</HStack>
																</Box>
															) : relatedUsersTable.totalItems > 0 ? (
																<Box className={`${notTintedCardClassName} overflow-hidden`}>
																	<Table className={`${tableBaseClassName} ${tableRelatedUsersMinWidthClassName}`}>
																		<TableHeader>
																			<TableRow className={tableHeaderRowClassName}>
																				<TableHead className={tableHeadTextClassName}>Usuário vinculado</TableHead>
																				<TableActionsHeader
																					widthClassName={tableSingleActionColumnClassName}
																					headerClassName={tableActionsHeaderClassName}
																					textClassName={tableActionsHeaderTextClassName}
																				/>
																			</TableRow>
																		</TableHeader>
																		<TableBody>
																			{relatedUsersTable.items.map(relatedUser => (
																				<TableRow
																					key={relatedUser.id}
																					className={tableRowClassName}
																				>
																					<TableData useRNView className={tableContentCellClassName}>
																						<VStack className="min-w-0 flex-1 gap-1">
																							<Text className="text-sm font-semibold" numberOfLines={1}>
																								{relatedUser.email || relatedUser.id}
																							</Text>
																							<Text className={`${helperText} text-xs`} numberOfLines={1} ellipsizeMode="middle">
																								ID: {relatedUser.id}
																							</Text>
																						</VStack>
																					</TableData>
																					<TableActionsCell
																						widthClassName={tableSingleActionColumnClassName}
																						cellClassName={tableActionsCellClassName}
																					>
																						<ConfigurationActionButton
																							icon={TrashIcon}
																							variant="link"
																							className={tableIconButtonClassName}
																							action="negative"
																							accessibilityLabel={`Desvincular usuário ${relatedUser.email || relatedUser.id}`}
																							onPress={() =>
																								setPendingAction({
																									type: 'delete-related-user',
																									payload: {
																										userId: relatedUser.id,
																										identifier: relatedUser.email || relatedUser.id,
																									},
																								})
																							}
																						/>
																					</TableActionsCell>
																				</TableRow>
																			))}
																		</TableBody>
																		<TableCaption className={tableCaptionClassName}>
																			{relatedUsersTable.totalItems} vínculo(s) encontrado(s).
																		</TableCaption>
																	</Table>
																	{renderTablePagination('relatedUsers', relatedUsersTable)}
																</Box>
															) : (
																renderEmptyTableState('Você ainda não vinculou nenhum usuário.')
															)}
														</VStack>
													) : null}

													{item.showValueVisibilitySwitch ? (
														<Box className={`${notTintedCardClassName} px-4`}>
															<VStack className="gap-3">
																<HStack className="items-center justify-between gap-4">
																	<VStack className="min-w-0 flex-1 gap-1">
																		<HStack className="min-w-0 items-center gap-1">
																			<Text className="text-base font-semibold">Ocultar valores</Text>
																			<Popover
																				placement="bottom"
																				size="md"
																				offset={0}
																				shouldFlip
																				focusScope={false}
																				trapFocus={false}
																				trigger={triggerProps => (
																					<Pressable
																						{...triggerProps}
																						hitSlop={8}
																						accessibilityRole="button"
																						accessibilityLabel="Informações sobre a ocultação de valores"
																					>
																						<Info
																							size={14}
																							color={isDarkMode ? '#94A3B8' : '#64748B'}
																							style={{ marginLeft: 4 }}
																						/>
																					</Pressable>
																				)}
																			>
																				<PopoverBackdrop className="bg-transparent" />
																				<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
																					<PopoverBody className="px-3 py-3">
																						<Text className={`${bodyText} text-xs leading-5`}>
																							{valueVisibilityPopoverText}
																						</Text>
																					</PopoverBody>
																				</PopoverContent>
																			</Popover>
																		</HStack>
																	</VStack>
																	<Switch
																		value={shouldHideValues}
																		onValueChange={handleToggleValueVisibility}
																		isDisabled={isLoadingPreference}
																		trackColor={switchTrackColor}
																		thumbColor={switchThumbColor}
																		ios_backgroundColor={switchIosBackgroundColor}
																	/>
																</HStack>
															</VStack>
														</Box>
													) : null}

													{item.showThemeSwitch ? (
														<Box className={`${notTintedCardClassName} px-4`}>
															<VStack className="gap-3">
																<HStack className="items-center justify-between gap-4">
																	<VStack className="min-w-0 flex-1 gap-1">
																		<HStack className="min-w-0 items-center gap-1">
																			<Text className="text-base font-semibold">Modo escuro</Text>
																			<Popover
																				placement="bottom"
																				size="md"
																				offset={0}
																				shouldFlip
																				focusScope={false}
																				trapFocus={false}
																				trigger={triggerProps => (
																					<Pressable
																						{...triggerProps}
																						hitSlop={8}
																						accessibilityRole="button"
																						accessibilityLabel="Informações sobre o tema do aplicativo"
																					>
																						<Info
																							size={14}
																							color={isDarkMode ? '#94A3B8' : '#64748B'}
																							style={{ marginLeft: 4 }}
																						/>
																					</Pressable>
																				)}
																			>
																				<PopoverBackdrop className="bg-transparent" />
																				<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
																					<PopoverBody className="px-3 py-3">
																						<Text className={`${bodyText} text-xs leading-5`}>
																							{themePopoverText}
																						</Text>
																					</PopoverBody>
																				</PopoverContent>
																			</Popover>
																		</HStack>
																	</VStack>
																	<Switch
																		value={isDarkMode}
																		onValueChange={handleToggleDarkMode}
																		isDisabled={isLoadingTheme}
																		trackColor={switchTrackColor}
																		thumbColor={switchThumbColor}
																		ios_backgroundColor={switchIosBackgroundColor}
																	/>
																</HStack>
															</VStack>
														</Box>
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

				<View
					style={{
						marginHorizontal: -18,
						paddingBottom: 0,
						flexShrink: 0,
					}}
				>
					<Navigator defaultValue={2} />
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
							<Button
								variant="outline"
								onPress={handleCloseActionModal}
								isDisabled={isProcessingAction}
								className={submitButtonCancelClassName}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button
								variant="solid"
								action={confirmButtonAction}
								onPress={handleConfirmAction}
								isDisabled={isProcessingAction}
								className={submitButtonClassName}
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
			</View>
		</SafeAreaView>
	);
}
