import React from 'react';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { auth } from '@/FirebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { getProfileNameError, getUserProfileFirebase, getUserProfileAccessSummaryFirebase, updateUserProfileFirebase, type UserProfile } from '@/functions/UserProfileFirebase';

export function useUserProfile() {
	const { user } = useAuth();
	const uid = user?.uid;
	const [profile, setProfile] = React.useState<UserProfile | null>(null);
	const [accessSummary, setAccessSummary] = React.useState<{ isAdmin: boolean; monitoredRecordsCount: number } | null>(null);
	const [accessSummaryLoading, setAccessSummaryLoading] = React.useState(true);
	const [accessSummaryError, setAccessSummaryError] = React.useState(false);
	const [name, setName] = React.useState('');
	const [loading, setLoading] = React.useState(true);
	const [loadError, setLoadError] = React.useState('');
	const [nameError, setNameError] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [feedback, setFeedback] = React.useState<{ text: string; error: boolean } | null>(null);
	const [retry, setRetry] = React.useState(0);
	const lifetime = React.useRef(0);
	const saveLock = React.useRef(false);
	const copyLock = React.useRef(false);
	const lastFocusedUid = React.useRef<string | undefined>(undefined);
	const preserveDraftOnReload = React.useRef(false);
	const draftRef = React.useRef({ name, profile });
	draftRef.current = { name, profile };

	useFocusEffect(React.useCallback(() => {
		if (lastFocusedUid.current !== uid) { lastFocusedUid.current = uid; return; }
		const draft = draftRef.current;
		preserveDraftOnReload.current = Boolean(draft.profile && draft.profile.uid === uid && draft.name.trim() !== draft.profile.name);
		setRetry(value => value + 1);
	}, [uid]));

	React.useEffect(() => {
		const version = ++lifetime.current;
		const preserveDraft = preserveDraftOnReload.current && draftRef.current.profile?.uid === uid;
		const preservedName = draftRef.current.name;
		preserveDraftOnReload.current = false;
		if (!preserveDraft) setProfile(null);
		setAccessSummary(null);
		setAccessSummaryLoading(Boolean(uid));
		setAccessSummaryError(false);
		if (!preserveDraft) setName('');
		setNameError(null);
		setFeedback(null);
		setLoadError('');
		setLoading(true);
		setSaving(false);
		saveLock.current = false;
		const isCurrent = () => lifetime.current === version && auth.currentUser?.uid === uid;
		if (!uid) {
			setLoading(false);
			setAccessSummaryLoading(false);
			return () => { lifetime.current += 1; };
		}

		const load = async () => {
			let profileLoaded = false;
			try {
				const result = await getUserProfileFirebase(uid);
				if (!isCurrent()) return;
				setProfile(result);
				setName(preserveDraft ? preservedName : result.name);
				setLoading(false);
				profileLoaded = true;

				const summary = await getUserProfileAccessSummaryFirebase(uid, result);
				if (!isCurrent()) return;
				setAccessSummary(summary);
			} catch {
				if (!isCurrent()) return;
				if (!profileLoaded) setLoadError('Não foi possível carregar seu perfil. Tente novamente.');
				else setAccessSummaryError(true);
			} finally {
				if (isCurrent()) {
					setLoading(false);
					setAccessSummaryLoading(false);
				}
			}
		};

		void load();
		return () => { lifetime.current += 1; };
	}, [uid, retry]);

	const currentProfile = profile?.uid === uid ? profile : null;
	const dirty = Boolean(currentProfile && name.trim() !== currentProfile.name);
	const changeName = (value: string) => {
		setName(value);
		setFeedback(null);
		if (nameError) setNameError(getProfileNameError(value));
	};
	const reset = () => {
		if (saveLock.current) return;
		setName(currentProfile?.name ?? '');
		setNameError(null);
		setFeedback(null);
	};
	const save = async () => {
		if (!uid || !currentProfile || saveLock.current) return false;
		const validation = getProfileNameError(name);
		setNameError(validation);
		if (validation) return false;
		if (!dirty) return true;
		const version = lifetime.current;
		const isCurrent = () => version === lifetime.current && auth.currentUser?.uid === uid;
		saveLock.current = true;
		setSaving(true);
		setFeedback(null);
		try {
			const savedName = await updateUserProfileFirebase(uid, name);
			if (!isCurrent()) return false;
			setProfile({ ...currentProfile, name: savedName });
			setName(savedName);
			setFeedback({ text: 'Perfil atualizado.', error: false });
			return true;
		} catch {
			if (isCurrent()) setFeedback({ text: 'Não foi possível salvar. Suas alterações foram mantidas; tente novamente.', error: true });
			return false;
		} finally {
			if (version === lifetime.current) {
				saveLock.current = false;
				setSaving(false);
			}
		}
	};
	const copyId = async () => {
		if (!uid || copyLock.current) return false;
		const version = lifetime.current;
		copyLock.current = true;
		try {
			const copied = await Clipboard.setStringAsync(uid);
			if (!copied) throw new Error('clipboard/unavailable');
			return version === lifetime.current && auth.currentUser?.uid === uid;
		} catch {
			if (version === lifetime.current && auth.currentUser?.uid === uid) setFeedback({ text: 'Não foi possível copiar o ID. Tente novamente.', error: true });
			return false;
		} finally {
			copyLock.current = false;
		}
	};
	return {
		profile: currentProfile,
		accessSummary,
		accessSummaryLoading,
		accessSummaryError,
		name,
		changeName,
		nameError,
		loading,
		loadError,
		saving,
		dirty,
		feedback,
		save,
		reset,
		copyId,
		reload: () => setRetry(value => value + 1),
	};
}
