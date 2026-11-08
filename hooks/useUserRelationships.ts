import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import type { UserRelationshipResult } from '@/types/presentation/user-relationship';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
import React from 'react';
type Link = { id: string; name: string; invitationId?: string };
type Prepared = {
	action: 'link' | 'unlink';
	target: string;
	preview: UserRelationshipResult;
	attempted: boolean;
};
export function useUserRelationships() {
	const [name, changeName] = React.useState('');
	return {
		name,
		changeName,
		overview: { linked: [] as Link[], incoming: [] as Link[], outgoing: [] as Link[] },
		loading: false,
		loadError: FEATURE_UNAVAILABLE_MESSAGE,
		busy: false,
		prepared: null as Prepared | null,
		feedback: '',
		reload: showFeatureUnavailable,
		prepare: async (..._input: string[]) => showFeatureUnavailable(),
		confirm: async (): Promise<(UserRelationshipResult & { action: 'link' | 'unlink' }) | null> => {
			showFeatureUnavailable();
			return null;
		},
		cancel: () => {},
		reset: () => changeName(''),
	};
}
