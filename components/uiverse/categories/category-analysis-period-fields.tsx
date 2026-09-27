import React from 'react';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { formatCategoryAnalysisDate, type CategoryAnalysisRange } from '@/utils/categoryAnalysis';

type Props = {
	range: CategoryAnalysisRange;
	error: string | null;
	disabled: boolean;
	onStartChange: (date: Date) => void;
	onEndChange: (date: Date) => void;
};

export default function CategoryAnalysisPeriodFields({ range, error, disabled, onStartChange, onEndChange }: Props) {
	return (
		<VStack space="sm" className="mb-5">
			<HStack space="lg" className="w-full">
				<DatePickerField
					label="Data inicial" accessibilityLabel="Data inicial do histórico"
					value={formatCategoryAnalysisDate(range.startDate)}
					onChange={(_, date) => onStartChange(date)} isDisabled={disabled}
					containerClassName="flex-1 min-w-0" labelClassName={LUMUS_FORM_CLASS_NAMES.label}
					triggerClassName={LUMUS_FORM_CLASS_NAMES.input} inputClassName={LUMUS_CLASS_NAMES.inputText}
				/>
				<DatePickerField
					label="Data final" accessibilityLabel="Data final do histórico"
					value={formatCategoryAnalysisDate(range.endDate)}
					onChange={(_, date) => onEndChange(date)} isDisabled={disabled}
					containerClassName="flex-1 min-w-0" labelClassName={LUMUS_FORM_CLASS_NAMES.label}
					triggerClassName={LUMUS_FORM_CLASS_NAMES.input} inputClassName={LUMUS_CLASS_NAMES.inputText}
				/>
			</HStack>
			{error ? <Text accessibilityLiveRegion="polite" className={LUMUS_FORM_CLASS_NAMES.error}>{error}</Text> : null}
		</VStack>
	);
}
