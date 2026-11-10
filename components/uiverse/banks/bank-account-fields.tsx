import React from 'react';
import { View } from 'react-native';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
	Select,
	SelectBackdrop,
	SelectContent,
	SelectInput,
	SelectItem,
	SelectPortal,
	SelectTrigger,
} from '@/components/ui/select';
import { ACCOUNT_TYPES, type AccountType } from '@/domain/banks';
import { LUMUS_CLASS_NAMES as ui, LUMUS_FORM_CLASS_NAMES as form } from '@/design-system/tokens';
type Props = {
	institutionName: string;
	onInstitutionName(value: string): void;
	accountType: AccountType | 'unknown';
	onAccountType(value: AccountType): void;
	date: string;
	onDate(value: string): void;
	isEditing: boolean;
	disabled: boolean;
	customInstitution: boolean;
};
export default function BankAccountFields(props: Props) {
	return (
		<View className="gap-4">
			{props.customInstitution && (
				<View>
					<Text className={form.label}>Instituição financeira</Text>
					<Input className={form.input} isDisabled={props.disabled}>
						<InputField
							accessibilityLabel="Instituição financeira"
							value={props.institutionName}
							onChangeText={props.onInstitutionName}
							maxLength={100}
							placeholder="Nome da instituição"
							className={ui.inputText}
						/>
					</Input>
				</View>
			)}
			<View>
				<Text className={form.label}>Tipo da conta</Text>
				<Select
					selectedLabel={ACCOUNT_TYPES.find((type) => type.value === props.accountType)?.label}
					selectedValue={props.accountType === 'unknown' ? undefined : props.accountType}
					onValueChange={(value) => props.onAccountType(value as AccountType)}
					isDisabled={props.disabled}
				>
					<SelectTrigger className={form.input} accessibilityLabel="Tipo da conta">
						<SelectInput
							value={ACCOUNT_TYPES.find((type) => type.value === props.accountType)?.label || ''}
							placeholder="Selecione o tipo da conta"
							className={ui.inputText}
						/>
					</SelectTrigger>
					<SelectPortal>
						<SelectBackdrop />
						<SelectContent>
							{ACCOUNT_TYPES.map((type) => (
								<SelectItem key={type.value} label={type.label} value={type.value} />
							))}
						</SelectContent>
					</SelectPortal>
				</Select>
			</View>
			{!props.isEditing && (
				<View>
					<Text className={form.label}>Data do saldo inicial</Text>
					<Input className={form.input} isDisabled={props.disabled}>
						<InputField
							accessibilityLabel="Data do saldo inicial"
							value={props.date}
							onChangeText={props.onDate}
							placeholder="DD/MM/AAAA"
							maxLength={10}
							keyboardType="numbers-and-punctuation"
							className={ui.inputText}
						/>
					</Input>
				</View>
			)}
		</View>
	);
}
