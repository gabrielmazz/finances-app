import { LUMUS_CLASS_NAMES } from './tokens';

export const AUTH_CLASS_NAMES = {
	submitText: 'text-center font-bold text-lumus-on-accent',
	modeAction: 'min-h-12 rounded-control px-2 py-3 text-sm font-semibold text-amber-800 dark:text-lumus-accent focus-visible:ring-2 focus-visible:ring-lumus-focus hover:opacity-80 disabled:opacity-50',
	modeActionNative: 'min-h-12 items-center justify-center rounded-control px-2 py-3 disabled:opacity-50',
	modeActionText: 'text-sm font-semibold text-amber-800 dark:text-lumus-accent',
	feedbackSuccess: `mb-4 text-sm ${LUMUS_CLASS_NAMES.successText}`,
	feedbackError: `mb-4 text-sm ${LUMUS_CLASS_NAMES.errorText}`,
} as const;
