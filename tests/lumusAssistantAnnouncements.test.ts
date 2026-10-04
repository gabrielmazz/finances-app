import React from 'react';

const mockHost = ({ children, ...props }: Record<string, unknown>) => React.createElement('host', props, children as React.ReactNode);
jest.doMock('react-native', () => ({ View: mockHost, Pressable: mockHost, useWindowDimensions: () => ({ width: 390, height: 844 }) }));
jest.doMock('@expo/vector-icons', () => ({ Ionicons: mockHost }));
jest.doMock('@mantine/charts', () => ({ BarChart: mockHost, DonutChart: mockHost, LineChart: mockHost }));
jest.doMock('@mantine/core', () => ({ MantineProvider: mockHost }));
jest.doMock('react-native-gifted-charts', () => ({ BarChart: mockHost, PieChart: mockHost, LineChart: mockHost }));
jest.doMock('@/components/ui/button', () => ({ Button: mockHost, ButtonText: mockHost }));
jest.doMock('@/components/ui/input', () => ({ Input: mockHost, InputField: mockHost }));
jest.doMock('@/components/ui/text', () => ({ Text: mockHost }));
jest.doMock('@/components/uiverse/assistant/assistant-inline-field', () => ({ AssistantInlineField: mockHost }));

const adapters = [
	['web', require('@/components/web/assistant/assistant-cards.web')],
	['mobile', require('@/components/mobile/assistant/assistant-cards.native')],
] as const;

describe.each(adapters)('respostas acessíveis no %s', (platform, { AssistantTextBubble }) => {
	const render = (role: 'user' | 'assistant', hideValues = false) => AssistantTextBubble({
		message: { id: 'answer', type: 'success', role, text: 'Saldo: R$ 917,10.', createdAt: Date.now() },
		isDarkMode: false, hideValues, isSpeaking: false, onSpeak: jest.fn(), onStop: jest.fn(),
	});
	it('anuncia a resposta final sem exigir leitura de voz ativada', () => {
		const answer = render('assistant').props.children[0];
		expect(answer.props[platform === 'web' ? 'aria-live' : 'accessibilityLiveRegion']).toBe('polite');
		expect(answer.props.children).toBe('Saldo: R$ 917,10.');
	});
	it('anuncia somente o texto já protegido pela privacidade', () => {
		const answer = render('assistant', true).props.children[0];
		expect(answer.props.children).not.toContain('917');
		expect(answer.props.accessibilityLabel).toBeUndefined();
	});
	it('não anuncia novamente a mensagem da própria pessoa', () => {
		const message = render('user').props.children[0];
		expect(message.props['aria-live']).toBeUndefined();
		expect(message.props.accessibilityLiveRegion).toBeUndefined();
	});
});
