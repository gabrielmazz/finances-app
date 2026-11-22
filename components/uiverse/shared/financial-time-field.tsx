import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';

export default function FinancialTimeField({ label, value, onChange, isDisabled, inputClassName = LUMUS_CLASS_NAMES.inputText,
  triggerClassName = LUMUS_FORM_CLASS_NAMES.input }: {
  label: string; value: string; onChange: (value: string) => void; isDisabled?: boolean;
  inputClassName?: string; triggerClassName?: string;
}) {
  return <>
    <Text className={LUMUS_FORM_CLASS_NAMES.label}>{label}</Text>
    <Input className={triggerClassName} isDisabled={isDisabled}>
      <InputField value={value} onChangeText={text => {
        const digits = text.replace(/\D/g, '').slice(0, 4);
        onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
      }} accessibilityLabel={label} placeholder="HH:MM" keyboardType="numeric" maxLength={5} className={inputClassName} />
    </Input>
  </>;
}
