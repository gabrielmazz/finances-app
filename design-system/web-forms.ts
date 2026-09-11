import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';

export const WEB_EXPENSE_CLASS_NAMES = {
	formSurface: 'min-w-0 flex-1',
	formScroll: 'px-6 pb-8 pt-7 lg:px-8',
	fieldGrid: 'gap-4 lg:flex-row lg:flex-wrap',
	fieldHalf: 'lg:w-[calc(50%-8px)]',
	fieldFull: 'w-full',
	fieldLabel: LUMUS_FORM_CLASS_NAMES.label,
	fieldInlineLabel: `text-xs font-bold uppercase tracking-label ${LUMUS_CLASS_NAMES.label}`,
	fieldInput: LUMUS_FORM_CLASS_NAMES.input,
	fieldTextarea: LUMUS_FORM_CLASS_NAMES.textarea,
	fieldCard: LUMUS_FORM_CLASS_NAMES.section,
	sectionLabel: 'flex-row items-center gap-2',
	submit: LUMUS_FORM_CLASS_NAMES.submit,
	modal: 'max-w-[380px]',
} as const;

export const WEB_SELECT_CLASS_NAMES = {
	trigger: `${LUMUS_FORM_CLASS_NAMES.input} flex-row items-center justify-between overflow-hidden px-4`,
	value: `${LUMUS_CLASS_NAMES.inputText} min-w-0 flex-1`,
	placeholder: `${LUMUS_CLASS_NAMES.helper} min-w-0 flex-1`,
	icon: `${LUMUS_CLASS_NAMES.helper} ml-3 h-4 w-4 flex-none`,
	menu: LUMUS_FORM_CLASS_NAMES.selectMenu,
	option: LUMUS_FORM_CLASS_NAMES.selectOption,
	optionSelected: LUMUS_FORM_CLASS_NAMES.selectOptionSelected,
	optionDisabled: LUMUS_FORM_CLASS_NAMES.selectOptionDisabled,
	optionText: LUMUS_CLASS_NAMES.inputText,
} as const;

export const WEB_TIME_PICKER_CLASS_NAMES = {
	...WEB_SELECT_CLASS_NAMES,
	menu: `${WEB_SELECT_CLASS_NAMES.menu} flex-row gap-2`,
	column:
		'min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900',
	columnTitle: `${LUMUS_CLASS_NAMES.helper} px-2 pb-1 pt-1 text-2xs font-bold uppercase tracking-label`,
	columnScroll: 'h-56 max-h-56',
	option:
		'min-h-9 flex-row items-center justify-center rounded-xl px-2 py-2 web:transition-colors web:duration-fast web:hover:bg-slate-100 dark:web:hover:bg-slate-800',
	optionText: `${LUMUS_CLASS_NAMES.inputText} text-center tabular-nums`,
} as const;
