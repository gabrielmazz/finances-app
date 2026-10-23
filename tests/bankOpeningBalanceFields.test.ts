import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BankOpeningBalanceFields from '@/components/uiverse/banks/bank-opening-balance-fields';
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('@/components/ui/vstack', () => ({ VStack: ({ children }: React.PropsWithChildren) => require('react').createElement('View', null, children) }));
jest.mock('@/components/ui/text', () => ({ Text: ({ children, ...props }: React.PropsWithChildren) => require('react').createElement('Text', props, children) }));
jest.mock('@/components/ui/input', () => ({
  Input: ({ children }: React.PropsWithChildren) => require('react').createElement('View', null, children),
  InputField: (props: Record<string, unknown>) => require('react').createElement('TextInput', props),
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, isDisabled, ...props }: Record<string, unknown>) => require('react').createElement('Pressable', { ...props, disabled: isDisabled }, children),
  ButtonText: ({ children }: React.PropsWithChildren) => require('react').createElement('Text', null, children),
}));

// The shared Jest setup uses host nodes; accessibility queries still need flatten.
jest.requireMock('react-native').StyleSheet = { flatten: (style: unknown) => style ?? {} };

const Form = () => {
  const [value, setValue] = React.useState(0), [reason, setReason] = React.useState('');
  return React.createElement(BankOpeningBalanceFields, { valueInCents: value, onValueChange: setValue, reason, onReasonChange: setReason });
};
test('informa centavos, permite saldo negativo justificado e volta para positivo sem manter justificativa antiga', async () => {
  const ui = await render(React.createElement(Form));
  await fireEvent.changeText(ui.getByLabelText('Saldo inicial disponível'), '123456');
  expect(ui.getByLabelText('Saldo inicial disponível').props.value).toMatch(/1\.234,56/);
  expect(ui.queryByLabelText('Motivo do saldo inicial negativo')).toBeNull();
  await fireEvent.press(ui.getByText('Usar saldo negativo'));
  expect(ui.getByLabelText('Saldo inicial disponível').props.value).toContain('-');
  await fireEvent.changeText(ui.getByLabelText('Motivo do saldo inicial negativo'), 'Cheque especial');
  await fireEvent.press(ui.getByText('Usar saldo positivo'));
  expect(ui.queryByLabelText('Motivo do saldo inicial negativo')).toBeNull();
  await fireEvent.press(ui.getByText('Usar saldo negativo'));
  expect(ui.getByLabelText('Motivo do saldo inicial negativo').props.value).toBe('');
  await ui.unmount();
});
test('saldo zero bloqueia a troca de sinal e valor fora do teto mostra erro', async () => {
  const ui = await render(React.createElement(BankOpeningBalanceFields, { valueInCents: 0, onValueChange: jest.fn(), reason: '', onReasonChange: jest.fn() }));
  expect(ui.getByText('Usar saldo negativo').parent?.props.disabled).toBe(true);
  await ui.rerender(React.createElement(BankOpeningBalanceFields, { valueInCents: 1000000000001, onValueChange: jest.fn(), reason: '', onReasonChange: jest.fn() }));
  expect(ui.getByText('Saldo fora do limite permitido.')).toBeTruthy();
  await ui.unmount();
});
