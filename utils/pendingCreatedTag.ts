import type { TagIconFamily, TagIconStyle } from '@/hooks/useTagIcons';

export type PendingCreatedTag = {
	tagId: string;
	tagName: string;
	usageType: 'expense' | 'gain';
	iconFamily?: TagIconFamily | null;
	iconName?: string | null;
	iconStyle?: TagIconStyle | null;
};

let pendingCreatedTag: PendingCreatedTag | null = null;

export function setPendingCreatedTag(tag: PendingCreatedTag | null) {
	pendingCreatedTag = tag;
}

export function peekPendingCreatedTag() {
	return pendingCreatedTag;
}

export function clearPendingCreatedTag(tagId?: string) {
	if (!tagId || pendingCreatedTag?.tagId === tagId) {
		pendingCreatedTag = null;
	}
}
