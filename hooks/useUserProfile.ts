import { errorMessage } from '@/application/errors';
import { getFirebaseClient } from '@/firebase/client';
import { saveProfileName } from '@/firebase/profiles';
import { validateProfileName } from '@/domain/profile';
import { useSession } from './useSession';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
export function useUserProfile() {
	const session = useSession();
	const uid = session.user?.uid ?? null;
	const [draft, setDraft] = React.useState<{ uid: string | null; name: string; expectedName: string | null }>(
		{ uid: null, name: '', expectedName: null },
	);
	const name = draft.uid === uid ? draft.name : '';
	const currentUid = React.useRef(uid);
	currentUid.current = uid;
	const changeName = (value: string) =>
		setDraft((previous) => ({
			uid,
			name: value,
			expectedName: previous.uid === uid ? previous.expectedName : (session.profile?.name ?? null),
		}));
	const [saving, setSaving] = React.useState(false);
	const pending = React.useRef(false);
	const [feedback, setFeedback] = React.useState<{ text: string; error: boolean } | null>(null);
	React.useEffect(() => {
		setDraft((previous) => {
			if (previous.uid === uid && (session.profileLoading || previous.name !== (previous.expectedName ?? '')))
				return previous;
			return { uid, name: session.profile?.name ?? '', expectedName: session.profile?.name ?? null };
		});
	}, [uid, session.profile?.name, session.profileLoading]);
	React.useEffect(() => {
		setFeedback(null);
	}, [session.user?.uid]);
	const profile =
		session.profile ??
		(session.user
			? {
					uid: session.user.uid,
					name: '',
					email: session.user.email ?? '',
					createdAt: null,
					adminUser: false,
				}
			: null);
	return {
		profile,
		accessSummary: null as { isAdmin: boolean; monitoredRecordsCount: number } | null,
		accessSummaryLoading: false,
		accessSummaryError: true,
		relatedUsers: [] as { id: string; name: string }[],
		relatedUsersLoading: false,
		relatedUsersError: true,
		name,
		changeName,
		nameError: name ? validateProfileName(name) : null,
		loading: session.profileLoading,
		loadError: session.error,
		saving,
		dirty: name !== (draft.uid === uid ? (draft.expectedName ?? '') : ''),
		feedback,
		save: async () => {
			if (pending.current || !session.user) return false;
			const invalid = validateProfileName(name);
			if (invalid) {
				setFeedback({ text: invalid, error: true });
				return false;
			}
			pending.current = true;
			setSaving(true);
			try {
				await saveProfileName(getFirebaseClient(), session.user.uid, name, draft.expectedName);
				if (currentUid.current !== uid) return false;
				setDraft({ uid, name: name.trim(), expectedName: name.trim() });
				await session.reload();
				if (currentUid.current !== uid) return false;
				setFeedback({ text: 'Perfil salvo.', error: false });
				return true;
			} catch (error) {
				if (currentUid.current === uid) setFeedback({ text: errorMessage(error), error: true });
				return false;
			} finally {
				pending.current = false;
				setSaving(false);
			}
		},
		reset: () => {
			setDraft({ uid, name: session.profile?.name ?? '', expectedName: session.profile?.name ?? null });
			setFeedback(null);
		},
		copyId: async () => {
			if (!session.user) return false;
			try {
				await Clipboard.setStringAsync(session.user.uid);
				return true;
			} catch (error) {
				if (currentUid.current === uid) setFeedback({ text: errorMessage(error), error: true });
				return false;
			}
		},
		reload: () => {
			void session.reload();
		},
	};
}
