import React from 'react';
import { NotifierWrapper as NativeNotifierWrapper } from 'react-native-notifier';

export default function NotifierBoundary({ children }: React.PropsWithChildren) {
	return <NativeNotifierWrapper translucentStatusBar>{children}</NativeNotifierWrapper>;
}
