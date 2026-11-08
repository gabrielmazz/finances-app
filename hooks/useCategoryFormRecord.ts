import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
export function useCategoryFormRecord(tagId: string | null) {
	return {
		record: null as Record<string, unknown> | null,
		isLoading: false,
		error: tagId ? FEATURE_UNAVAILABLE_MESSAGE : null,
		reload: showFeatureUnavailable,
	};
}
