import { errorMessage } from '@/application/errors';
import { getFirebaseClient } from '@/firebase/client';
import { saveProfileName } from '@/firebase/profiles';
import { listFinancialGroups, type FinancialGroup } from '@/firebase/financialContext';
import { useIsFocused } from 'expo-router';
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

export function useLinkedFinancialContexts() {
	const { user, context, selectFinancialGroup } = useSession();
	const uid = user?.uid;
	const groupId = context?.kind === 'group' ? context.groupId : null;
	const role = context?.kind === 'group' ? context.role : null;
	const focused = useIsFocused();
	const [groups, setGroups] = React.useState<FinancialGroup[] | null>(null);
	const [loadError, setLoadError] = React.useState(false);
	const [selectError, setSelectError] = React.useState(false);
	const [switching, setSwitching] = React.useState(false);
	const [revision, reload] = React.useReducer(value => value + 1, 0);

	React.useEffect(() => {
		if (!uid || !focused) return;
		let active = true;
		setGroups(null);
		setLoadError(false);
		void listFinancialGroups(getFirebaseClient(), uid).then(
			items => { if (active) setGroups(items); },
			() => { if (active) setLoadError(true); },
		);
		return () => { active = false; };
	}, [uid, focused, revision, groupId, role]);

	async function select(id: string | null) {
		setSwitching(true);
		setSelectError(false);
		try {
			await selectFinancialGroup(id);
		} catch {
			setSelectError(true);
			reload();
		} finally {
			setSwitching(false);
		}
	}

	return { uid, groupId, groups, loadError, selectError, switching, select, reload };
}
