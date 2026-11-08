import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import type { UserProfile } from '@/types/presentation/user-profile';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
import React from 'react';
export function useUserProfile() {
	const [name, changeName] = React.useState('');
	return {
		profile: null as UserProfile | null,
		accessSummary: null as { isAdmin: boolean; monitoredRecordsCount: number } | null,
		accessSummaryLoading: false,
		accessSummaryError: true,
		relatedUsers: [] as { id: string; name: string }[],
		relatedUsersLoading: false,
		relatedUsersError: true,
		name,
		changeName,
		nameError: null as string | null,
		loading: false,
		loadError: FEATURE_UNAVAILABLE_MESSAGE,
		saving: false,
		dirty: false,
		feedback: null as { text: string; error: boolean } | null,
		save: async () => {
			showFeatureUnavailable();
			return false;
		},
		reset: () => changeName(''),
		copyId: async () => {
			showFeatureUnavailable();
			return false;
		},
		reload: showFeatureUnavailable,
	};
}
