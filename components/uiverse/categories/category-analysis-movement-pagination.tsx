import React from 'react';
import { Button, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';

type Props = {
	total: number;
	showAll: boolean;
	page: number;
	pageCount: number;
	onToggle: () => void;
	onPageChange: (page: number) => void;
};

export default function CategoryAnalysisMovementPagination({ total, showAll, page, pageCount, onToggle, onPageChange }: Props) {
	if (total <= 8) return null;
	return (
		<VStack space="sm">
			<Button variant="outline" onPress={onToggle} accessibilityState={{ expanded: showAll }}>
				<ButtonText>{showAll ? 'Ver recentes' : `Ver todas (${total})`}</ButtonText>
			</Button>
			{showAll && pageCount > 1 ? (
				<>
					<Text size="sm" accessibilityLiveRegion="polite" className={LUMUS_CLASS_NAMES.helper}>
						Página {page + 1} de {pageCount} · {total} movimentações
					</Text>
					<HStack space="sm">
						<Button variant="outline" className="flex-1" isDisabled={page === 0} onPress={() => onPageChange(page - 1)}>
							<ButtonText>Anterior</ButtonText>
						</Button>
						<Button variant="outline" className="flex-1" isDisabled={page + 1 >= pageCount} onPress={() => onPageChange(page + 1)}>
							<ButtonText>Próxima</ButtonText>
						</Button>
					</HStack>
				</>
			) : null}
		</VStack>
	);
}
