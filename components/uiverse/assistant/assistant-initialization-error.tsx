import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';

export function AssistantInitializationError({ message, onRetry }: { message: string; onRetry(): void }) {
  return <VStack className={ASSISTANT_CLASS_NAMES.consentCard} space="md">
    <Text accessibilityRole="alert" className="text-lumus-error">{message}</Text>
    <Button action="default" variant="outline" onPress={onRetry}>
      <ButtonText>Tentar carregar novamente</ButtonText>
    </Button>
  </VStack>;
}
