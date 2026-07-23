'use client';

import React from 'react';
import {
	Pressable,
	ScrollView,
	View,
	type ScrollViewProps,
	type StyleProp,
	type TextInput,
	type ViewProps,
	type ViewStyle,
} from 'react-native';

import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

/**
 * Primitivas de conversa baseadas no Chat AI do Gluestack.
 *
 * A implementação usa as primitivas Gluestack já instaladas no projeto (v3),
 * preservando a API de composição do Chat AI sem depender da linha alpha do CLI.
 */

type ChatRole = 'assistant' | 'system' | 'user';

export type PromptInputSubmitPayload = {
	text: string;
	files: [];
};

type PromptInputContextValue = {
	text: string;
	setText(value: string): void;
	isDisabled: boolean;
};

const PromptInputContext = React.createContext<PromptInputContextValue | null>(null);

type PromptInputSubmitContextValue = {
	submit(): void;
	isDisabled: boolean;
};

const PromptInputSubmitContext = React.createContext<PromptInputSubmitContextValue | null>(null);

const usePromptInputContext = () => {
	const context = React.useContext(PromptInputContext);
	if (!context) {
		throw new Error('Os elementos do PromptInput devem estar dentro de PromptInputProvider.');
	}
	return context;
};

const usePromptInputSubmitContext = () => {
	const context = React.useContext(PromptInputSubmitContext);
	if (!context) {
		throw new Error('PromptInputSubmit deve estar dentro de PromptInput.');
	}
	return context;
};

export type ConversationProps = ViewProps;

export const Conversation = ({ children, ...props }: ConversationProps) => (
	<View {...props}>{children}</View>
);

export type ConversationContentProps = ScrollViewProps;

export const ConversationContent = React.forwardRef<ScrollView, ConversationContentProps>(
	function ConversationContent({ children, ...props }, ref) {
		return (
			<ScrollView ref={ref} {...props}>
				{children}
			</ScrollView>
		);
	},
);

export type ConversationEmptyStateProps = {
	title: string;
	description?: string;
	children?: React.ReactNode;
	style?: StyleProp<ViewStyle>;
};

export const ConversationEmptyState = ({
	title,
	description,
	children,
	style,
}: ConversationEmptyStateProps) => (
	<View style={[{ alignItems: 'center', gap: 14, paddingVertical: 10 }, style]}>
		<View style={{ alignItems: 'center', gap: 5 }}>
			<Text className="text-center text-typography-900 text-2xl font-bold">{title}</Text>
			{description ? (
				<Text className="text-center text-typography-500 leading-5">{description}</Text>
			) : null}
		</View>
		{children}
	</View>
);

export type MessageProps = Omit<ViewProps, 'role'> & {
	role: ChatRole;
	index?: number;
};

export const Message = ({ role, children, style, ...props }: MessageProps) => (
	<View
		{...props}
		style={[
			{ width: '100%' },
			role === 'user' ? { alignItems: 'flex-end' } : { alignItems: 'stretch' },
			style,
		]}
	>
		{children}
	</View>
);

export type MessageContentProps = Omit<ViewProps, 'role'> & {
	role?: ChatRole;
};

export const MessageContent = ({ role = 'assistant', children, style, ...props }: MessageContentProps) => (
	<View
		{...props}
		style={[
			{ maxWidth: '92%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11 },
			role === 'user'
				? { alignSelf: 'flex-end', backgroundColor: '#fef08a' }
				: { alignSelf: 'flex-start', backgroundColor: '#ffffff' },
			style,
		]}
	>
		{children}
	</View>
);

export type PromptInputProviderProps = {
	children: React.ReactNode;
	value?: string;
	onChangeText?(value: string): void;
	isDisabled?: boolean;
};

export const PromptInputProvider = ({
	children,
	value,
	onChangeText,
	isDisabled = false,
}: PromptInputProviderProps) => {
	const [uncontrolledValue, setUncontrolledValue] = React.useState('');
	const text = value ?? uncontrolledValue;
	const setText = React.useCallback((nextValue: string) => {
		if (value === undefined) setUncontrolledValue(nextValue);
		onChangeText?.(nextValue);
	}, [onChangeText, value]);
	const contextValue = React.useMemo(
		() => ({ text, setText, isDisabled }),
		[isDisabled, setText, text],
	);

	return (
		<PromptInputContext.Provider value={contextValue}>
			{children}
		</PromptInputContext.Provider>
	);
};

export type PromptInputProps = ViewProps & {
	onSubmit?(payload: PromptInputSubmitPayload): void;
};

export const PromptInput = ({ children, onSubmit, ...props }: PromptInputProps) => {
	const { text, isDisabled } = usePromptInputContext();
	const submit = React.useCallback(() => {
		if (isDisabled || !text.trim()) return;
		onSubmit?.({ text, files: [] });
	}, [isDisabled, onSubmit, text]);
	const submitContext = React.useMemo(
		() => ({ submit, isDisabled: isDisabled || !text.trim() }),
		[isDisabled, submit, text],
	);

	return (
		<PromptInputSubmitContext.Provider value={submitContext}>
			<View {...props}>{children}</View>
		</PromptInputSubmitContext.Provider>
	);
};

export const PromptInputBody = ({ children, ...props }: ViewProps) => (
	<View {...props}>{children}</View>
);

export type PromptInputTextareaProps = Omit<
	React.ComponentProps<typeof InputField>,
	'value' | 'onChangeText'
> & {
	containerClassName?: string;
	containerStyle?: StyleProp<ViewStyle>;
	fieldClassName?: string;
	inputRef?: React.Ref<TextInput>;
};

export const PromptInputTextarea = ({
	containerClassName,
	containerStyle,
	fieldClassName,
	inputRef,
	...props
}: PromptInputTextareaProps) => {
	const { text, setText, isDisabled } = usePromptInputContext();

	return (
		<Input
			className={containerClassName}
			style={containerStyle}
			isDisabled={isDisabled}
		>
			<InputField
				ref={inputRef}
				value={text}
				onChangeText={setText}
				className={fieldClassName}
				{...props}
			/>
		</Input>
	);
};

export const PromptInputFooter = ({ children, ...props }: ViewProps) => (
	<View {...props}>{children}</View>
);

export const PromptInputTools = ({ children, ...props }: ViewProps) => (
	<View {...props}>{children}</View>
);

export type PromptInputButtonProps = React.ComponentProps<typeof Pressable>;

export const PromptInputButton = ({ children, ...props }: PromptInputButtonProps) => (
	<Pressable {...props}>{children}</Pressable>
);

export type PromptInputSubmitProps = React.ComponentProps<typeof Pressable>;

export const PromptInputSubmit = ({ children, disabled, onPress, ...props }: PromptInputSubmitProps) => {
	const { submit, isDisabled } = usePromptInputSubmitContext();
	const isSubmitDisabled = Boolean(disabled) || isDisabled;

	return (
		<Pressable
			{...props}
			disabled={isSubmitDisabled}
			onPress={event => {
				onPress?.(event);
				if (!event.defaultPrevented) submit();
			}}
		>
			{children}
		</Pressable>
	);
};
