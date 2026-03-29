export type PendingCreatedTag = {
	tagId: string;
	tagName: string;
	usageType: 'expense' | 'gain';
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
