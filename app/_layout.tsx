import '@/utils/reactNativeCompat';
import AppRoot from '@/components/app/app-root';
import { bootstrapLocalNotifications } from '@/utils/localNotifications';
import '@/global.css';

void bootstrapLocalNotifications();

export default AppRoot;
