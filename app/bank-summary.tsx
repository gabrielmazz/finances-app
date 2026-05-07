import { Redirect } from 'expo-router';
import { HOME_DASHBOARD_ROUTE } from '@/utils/navigation';

export default function BankSummaryRoute() {
	return <Redirect href={HOME_DASHBOARD_ROUTE} />;
}
