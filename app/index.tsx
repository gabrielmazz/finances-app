import { Redirect } from 'expo-router';

import { APP_ROUTE_PATHS } from '@/utils/navigation';
import { useSession } from '@/hooks/useSession';

export default function PlatformEntryRoute() {
	const { user } = useSession();
	return <Redirect href={user ? APP_ROUTE_PATHS.home : APP_ROUTE_PATHS.login} />;
}
