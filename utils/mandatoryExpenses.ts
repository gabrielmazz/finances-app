export const getCycleKeyFromDate = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${year}-${month}`;
};

export const getCurrentCycleKey = () => getCycleKeyFromDate(new Date());

export const isCycleKeyCurrent = (cycleKey?: string | null) => {
	if (!cycleKey) {
		return false;
	}
	return cycleKey === getCurrentCycleKey();
};
