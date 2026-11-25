import React from 'react';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Modal, ModalBackdrop, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@/components/ui/modal';
import { Text } from '@/components/ui/text';
import type { ReferenceChoice } from '@/domain/movements';
import { financialTime } from '@/utils/financialCivilDate';

export function MovementReferenceDialog({ accountName, referenceAt, onChoice }: {
  accountName: string;
  referenceAt: Date;
  onChoice: (choice: ReferenceChoice | null) => void;
}) {
  return (
    <Modal isOpen onClose={() => onChoice(null)} size="md">
      <ModalBackdrop />
      <ModalContent>
        <ModalHeader><Heading size="md">Já estava no saldo de referência?</Heading></ModalHeader>
        <ModalBody>
          <Text>Confira se o saldo de {accountName}, confirmado às {financialTime(referenceAt)} em São Paulo, já incluía esta movimentação.</Text>
        </ModalBody>
        <ModalFooter className="flex-col items-stretch">
          <Button onPress={() => onChoice('included')}><ButtonText>Já estava incluída</ButtonText></Button>
          <Button variant="outline" action="secondary" onPress={() => onChoice('after')}><ButtonText>Movimentar o saldo</ButtonText></Button>
          <Button variant="link" action="secondary" onPress={() => onChoice(null)}><ButtonText>Voltar</ButtonText></Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
