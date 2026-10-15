import React from 'react';

import { Button, ButtonText } from '@/components/ui/button';
import { Modal, ModalBackdrop, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { Text } from '@/components/ui/text';

type LogoutConfirmationProps = {
	isOpen: boolean;
	isLoggingOut: boolean;
	onCancel: () => void;
	onConfirm: () => Promise<void>;
};

export function LogoutConfirmation({ isOpen, isLoggingOut, onCancel, onConfirm }: LogoutConfirmationProps) {
	const cancelRef = React.useRef<React.ComponentRef<typeof Button>>(null);

	return (
		<Modal isOpen={isOpen} onClose={onCancel} size="md" initialFocusRef={cancelRef}>
			<ModalBackdrop />
			<ModalContent>
				<ModalHeader>
					<ModalTitle>Sair do Lumus?</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<Text className="text-body-sm text-typography-700">
						Deseja realmente sair do Lumus? Você precisará entrar novamente para acessar sua conta.
					</Text>
				</ModalBody>
				<ModalFooter>
					<Button ref={cancelRef} variant="outline" action="secondary" onPress={onCancel} isDisabled={isLoggingOut}>
						<ButtonText>Cancelar</ButtonText>
					</Button>
					<Button onPress={onConfirm} isDisabled={isLoggingOut} accessibilityState={{ busy: isLoggingOut, disabled: isLoggingOut }}>
						<ButtonText className="text-lumus-on-accent">{isLoggingOut ? 'Saindo…' : 'Sair'}</ButtonText>
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
