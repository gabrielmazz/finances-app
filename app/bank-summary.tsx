import { Redirect } from 'expo-router';

export default function BankSummaryRoute() {
	return <Redirect href={{ pathname: '/home', params: { tab: '0' } }} />;
}
