import React from 'react';

import {
	Actionsheet,
	ActionsheetBackdrop,
	ActionsheetContent as BaseActionsheetContent,
	ActionsheetDragIndicator,
	ActionsheetDragIndicatorWrapper,
	ActionsheetFlatList,
	ActionsheetIcon,
	ActionsheetItem,
	ActionsheetItemText,
	ActionsheetScrollView,
	ActionsheetSectionHeaderText,
	ActionsheetSectionList,
	ActionsheetVirtualizedList,
} from '../select/select-actionsheet';

type ActionsheetContentProps = React.ComponentProps<typeof BaseActionsheetContent>;

const ActionsheetContent = React.forwardRef<
	React.ComponentRef<typeof BaseActionsheetContent>,
	ActionsheetContentProps
>(function ActionsheetContent({ className, ...props }, ref) {
	return (
		<BaseActionsheetContent
			ref={ref}
			className={`web:w-full web:max-w-[1120px] web:self-center ${className ?? ''}`}
			{...props}
		/>
	);
});

ActionsheetContent.displayName = 'ActionsheetContent';

export {
	Actionsheet,
	ActionsheetBackdrop,
	ActionsheetContent,
	ActionsheetDragIndicator,
	ActionsheetDragIndicatorWrapper,
	ActionsheetFlatList,
	ActionsheetIcon,
	ActionsheetItem,
	ActionsheetItemText,
	ActionsheetScrollView,
	ActionsheetSectionHeaderText,
	ActionsheetSectionList,
	ActionsheetVirtualizedList,
};
