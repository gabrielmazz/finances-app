import { HOME_DASHBOARD_ROUTE } from '@/utils/navigation';
import { Redirect } from 'expo-router';

export default function BankSummaryRoute() {
	return <Redirect href={HOME_DASHBOARD_ROUTE} />;
}
