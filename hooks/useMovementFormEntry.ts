import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
export function useMovementFormEntry() {
	return {
		loading: false,
		ready: false,
		record: null as Record<string, unknown> | null,
		error: FEATURE_UNAVAILABLE_MESSAGE,
		retry: showFeatureUnavailable,
	};
}
