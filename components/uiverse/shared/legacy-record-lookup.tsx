import React from 'react';
import { Button, ButtonText } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useLegacyRecordLookup } from '@/hooks/useLegacyRecordLookup';

export default function LegacyRecordLookup({ kind }: { kind: 'bank' | 'category' }) {
  const lookup = useLegacyRecordLookup(kind);
  const [id, setId] = React.useState('');
  if (!lookup.enabled) return null;
  const label = kind === 'bank' ? 'ID do banco antigo' : 'ID da categoria antiga';
  return (
    <VStack className="gap-2">
      <Text className="text-sm font-semibold">{label}</Text>
      <Input isDisabled={lookup.loading} isInvalid={!!lookup.error}>
        <InputField accessibilityLabel={label} value={id} onChangeText={setId} autoCapitalize="none" autoCorrect={false} />
      </Input>
      {lookup.error && <Text accessibilityRole="alert" className="text-sm">{lookup.error}</Text>}
      <Button variant="outline" isDisabled={lookup.loading || !id.trim()} onPress={() => void lookup.open(id)}>
        <ButtonText>{lookup.loading ? 'Consultando…' : 'Consultar pelo ID'}</ButtonText>
      </Button>
    </VStack>
  );
}
