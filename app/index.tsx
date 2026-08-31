import { Redirect } from 'expo-router';

import { APP_ROUTE_PATHS } from '@/utils/navigation';

export default function PlatformEntryRoute() {
	return <Redirect href={APP_ROUTE_PATHS.login} />;
}
