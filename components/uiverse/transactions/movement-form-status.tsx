import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';

type Props = { loading: boolean; error: string | null; onRetry: () => void };
export default function MovementFormStatus({ loading, error, onRetry }: Props) {
  if (!loading && !error) return null;
  return (
    <VStack className="my-4 gap-3">
      <Text className={error ? LUMUS_CLASS_NAMES.errorText : LUMUS_CLASS_NAMES.helper} accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite">
        {error ?? 'Preparando lançamento…'}
      </Text>
      {error ? <Button variant="outline" onPress={onRetry} accessibilityLabel="Tentar carregar o lançamento novamente"><ButtonText>Tentar novamente</ButtonText></Button> : null}
    </VStack>
  );
}
