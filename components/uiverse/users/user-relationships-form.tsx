import React from 'react';
import { useIsFocused } from 'expo-router';
import { TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText } from '@/components/ui/button';
import { LUMUS_CLASS_NAMES as ui, LUMUS_FORM_CLASS_NAMES as form } from '@/design-system/tokens';
import { cn } from '@/lib/utils';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { usePostSubmitBehavior } from '@/hooks/usePostSubmitBehavior';
import { useBankMovementsRequest } from '@/hooks/useBankMovementsRequest';
import { useAppTheme } from '@/contexts/ThemeContext';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';

export default function UserRelationshipsForm({ inputRef, onInputFocus, dismissKeyboard }: { inputRef: React.RefObject<TextInput | null>; onInputFocus: () => void; dismissKeyboard: () => void }) {
  const state = useUserRelationships();
  const focused = useIsFocused();
  const focusedRef = React.useRef(focused); focusedRef.current = focused;
  const { isDarkMode } = useAppTheme();
  const applyPostSubmit = usePostSubmitBehavior('addUserRelation');
  const { beginRequest: beginFeedback } = useBankMovementsRequest('relationship-feedback');
  const disabled = state.loading || Boolean(state.loadError) || state.busy || Boolean(state.prepared);
  const prepared = state.prepared;
  const confirm = async () => {
    dismissKeyboard();
    const result = await state.confirm();
    const isCurrent = beginFeedback();
    if (!result || !isCurrent() || !focusedRef.current) return;
    showNotifierAlert({ description: result.status === 'unlinked' ? 'Vínculo revogado e convites cancelados.' : result.status === 'linked' ? 'Vínculo confirmado pelas duas contas.' : 'Convite enviado. A outra pessoa precisa aceitá-lo na própria conta.', type: 'success', isDarkMode });
    if (result.action === 'link') applyPostSubmit({ resetForm: state.reset });
  };
  return <View className="gap-5 pb-6">
    <Text className={ui.helper}>Use o ID copiado em Meu perfil. Um convite só compartilha dados autorizados depois do aceite da outra conta. O vínculo não altera membros ou papéis do grupo financeiro e não autoriza migração.</Text>
    <Button variant="outline" onPress={state.reload} isDisabled={state.loading || state.busy || Boolean(prepared?.attempted)} className={cn(ui.secondaryButton, ui.focusRing, 'min-h-12')}><ButtonText className={ui.body}>Atualizar vínculos</ButtonText></Button>
    {state.loading && <Text accessibilityRole="progressbar" accessibilityLabel="Carregando vínculos" className={ui.helper}>Carregando vínculos…</Text>}
    {state.loadError && <View className="gap-3"><Text accessibilityRole="alert" className={ui.errorText}>{state.loadError}</Text><Button onPress={state.reload} isDisabled={state.busy || Boolean(prepared?.attempted)} className={cn(ui.secondaryButton, 'min-h-12')}><ButtonText className={ui.body}>Tentar novamente</ButtonText></Button></View>}
    <View className="gap-2">
      <Text nativeID="relationship-target-label" className={form.label}>ID do usuário</Text>
      <Input isDisabled={disabled} className={cn(form.input, 'min-h-12')}><InputField ref={inputRef} value={state.name} onChangeText={state.changeName} editable={!disabled} autoCapitalize="none" autoCorrect={false} maxLength={128} accessibilityLabel="ID do usuário" accessibilityLabelledBy="relationship-target-label" placeholder="ID da outra conta" onFocus={onInputFocus} className={ui.inputText} /></Input>
    </View>
    <Button onPress={() => { dismissKeyboard(); void state.prepare('link'); }} isDisabled={disabled || !state.name.trim()} className={cn(ui.primaryButton, 'min-h-12')}><ButtonText className="font-bold text-lumus-on-accent">Conferir convite</ButtonText></Button>
    {prepared && <View className={cn(ui.card, 'gap-4 p-4')}>
      <Heading size="md" className={ui.heading}>Confira antes de confirmar</Heading>
      <Text className={ui.body}>{prepared.action === 'unlink' ? `Revogar o vínculo com ${prepared.preview.relatedUserName} e cancelar convites entre as contas. Permissões do grupo financeiro permanecem.` : prepared.preview.isLinked ? 'Estas contas já possuem um vínculo autorizado.' : prepared.preview.hasIncomingInvite ? `Aceitar o convite de ${prepared.preview.relatedUserName} e compartilhar os dados autorizados entre as contas.` : 'Enviar convite à conta informada. Ela precisará aceitar na própria conta para compartilhar dados autorizados.'}</Text>
      <Button onPress={() => void confirm()} isDisabled={state.busy} accessibilityState={{ busy: state.busy }} className={cn(ui.primaryButton, 'min-h-12')}><ButtonText className="font-bold text-lumus-on-accent">{state.busy ? 'Confirmando…' : prepared.attempted ? 'Confirmar operação anterior' : prepared.action === 'unlink' ? 'Confirmar revogação' : prepared.preview.hasIncomingInvite ? 'Confirmar aceite' : 'Confirmar convite'}</ButtonText></Button>
      <Button onPress={state.cancel} isDisabled={state.busy || prepared.attempted} className={cn(ui.secondaryButton, 'min-h-12')}><ButtonText className={ui.body}>Cancelar revisão</ButtonText></Button>
    </View>}
    {state.feedback && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className={ui.errorText}>{state.feedback}</Text>}
    {!state.loading && !state.loadError && <>
      <View className="gap-3"><Heading size="md" className={ui.heading}>Convites recebidos</Heading>
        {state.overview.incoming.length ? state.overview.incoming.map(invite => <View key={invite.id} className="gap-2"><Text className={ui.body}>{invite.name}</Text><Button isDisabled={state.busy || Boolean(prepared)} onPress={() => void state.prepare('link', invite.id)} className={cn(ui.secondaryButton, 'min-h-12')}><ButtonText className={ui.body}>Revisar convite de {invite.name}</ButtonText></Button><Button isDisabled={state.busy || Boolean(prepared)} onPress={() => void state.prepare('unlink', invite.id)} className={cn(ui.secondaryButton, 'min-h-12')}><ButtonText className={ui.body}>Recusar convite de {invite.name}</ButtonText></Button></View>) : <Text className={ui.helper}>Nenhum convite recebido.</Text>}
      </View>
      <View className="gap-3"><Heading size="md" className={ui.heading}>Convites enviados</Heading>
        {state.overview.outgoing.length ? state.overview.outgoing.map(invite => <Button key={invite.id} isDisabled={state.busy || Boolean(prepared)} onPress={() => void state.prepare('unlink', invite.id)} className={cn(ui.secondaryButton, 'min-h-12')}><ButtonText className={ui.body}>Cancelar convite para {invite.id}</ButtonText></Button>) : <Text className={ui.helper}>Nenhum convite enviado.</Text>}
      </View>
      <View className="gap-3"><Heading size="md" className={ui.heading}>Contas vinculadas</Heading>
        {state.overview.linked.length ? state.overview.linked.map(user => <View key={user.id} className="gap-2"><Text className={ui.body}>{user.name}</Text><Button isDisabled={state.busy || Boolean(prepared)} onPress={() => void state.prepare('unlink', user.id)} className={cn(ui.secondaryButton, 'min-h-12')}><ButtonText className={ui.body}>Revisar desvinculação de {user.name}</ButtonText></Button></View>) : <Text className={ui.helper}>Nenhuma pessoa vinculada.</Text>}
      </View>
    </>}
  </View>;
}
