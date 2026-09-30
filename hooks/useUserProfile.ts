import React from 'react';
import * as Clipboard from 'expo-clipboard';
import { auth } from '@/FirebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsersFirebase, getRelatedUsersFirebase } from '@/functions/RegisterUserFirebase';
import { getBanksWithUsersByPersonFirebase } from '@/functions/BankFirebase';
import { getTagsWithUsersByPersonFirebase } from '@/functions/TagFirebase';
import { getProfileNameError, getUserProfileFirebase, updateUserProfileFirebase, type UserProfile } from '@/functions/UserProfileFirebase';

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

	React.useEffect(() => {
		const version = ++lifetime.current;
		setProfile(null);
		setAccessSummary(null);
		setAccessSummaryLoading(Boolean(uid));
		setAccessSummaryError(false);
		setName('');
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
				setName(result.name);
				setLoading(false);
				profileLoaded = true;

				if (result.adminUser) {
					const [usersResult, banksResult, tagsResult] = await Promise.all([
						getAllUsersFirebase(),
						getBanksWithUsersByPersonFirebase(uid),
						getTagsWithUsersByPersonFirebase(uid),
					]);
					if (!usersResult.success || !banksResult.success || !tagsResult.success) {
						throw new Error('profile/access-summary');
					}
					if (!isCurrent()) return;
					setAccessSummary({
						isAdmin: true,
						monitoredRecordsCount:
							(Array.isArray(usersResult.data) ? usersResult.data.length : 0) +
							(Array.isArray(banksResult.data) ? banksResult.data.length : 0) +
							(Array.isArray(tagsResult.data) ? tagsResult.data.length : 0),
					});
				} else {
					const relatedUsersResult = await getRelatedUsersFirebase(uid);
					if (!relatedUsersResult.success) throw new Error('profile/access-summary');
					if (!isCurrent()) return;
					setAccessSummary({
						isAdmin: false,
						monitoredRecordsCount: Array.isArray(relatedUsersResult.data) ? relatedUsersResult.data.length : 0,
					});
				}
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
