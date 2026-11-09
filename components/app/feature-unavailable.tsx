import { cn } from '@/lib/utils';
import { Text } from '@/components/ui/text';
import { showNotifierAlert } from '@/components/uiverse/feedback/notifier-alert';
import { FEATURE_UNAVAILABLE_MESSAGE } from '@/utils/availability';
import { View } from 'react-native';
export function showFeatureUnavailable() {
	showNotifierAlert({
		title: 'Recurso indisponível',
		description: FEATURE_UNAVAILABLE_MESSAGE,
		type: 'info',
	});
}
export default function FeatureUnavailableNotice({ showWorkspace = false, message = FEATURE_UNAVAILABLE_MESSAGE }: { showWorkspace?: boolean; message?: string }) {
	return (
		<View
			className={cn('border-b border-outline-200 bg-background-0 px-4 py-2', showWorkspace && 'web:lg:pl-20')}
		>
			<Text className="text-xs text-typography-700" accessibilityLiveRegion="polite">
				{message}
			</Text>
		</View>
	);
}
