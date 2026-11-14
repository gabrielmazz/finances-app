import React, { act } from 'react';
import { createRoot } from 'test-renderer';
import { useRecentMovements } from '../hooks/useRecentMovements';
import { readMovementTimeline } from '../firebase/movements';

jest.mock('../firebase/client', () => ({ getFirebaseClient: () => ({}) }));
jest.mock('../firebase/movements', () => ({ readMovementTimeline: jest.fn() }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const read = readMovementTimeline as jest.Mock;
const scope = { kind: 'personal' as const, id: 'owner', uid: 'owner' };

afterEach(() => read.mockReset());

test('Home uses the statement reader, preserves its records and limits the display to six', async () => {
  const renderer = createRoot();
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `movement-${i}`, type: 'expense', bankId: 'bank', isFromMandatory: i === 0, isBankTransfer: i === 1, isCashRescue: i === 2 }));
  read.mockResolvedValue({ items, cursor: null, cashIncomplete: false, issues: 0 });
  let value: ReturnType<typeof useRecentMovements>;
  function Screen() { value = useRecentMovements(scope, [{ id: 'bank', name: 'Synthetic bank' }], true); return null; }
  await act(async () => { renderer.render(React.createElement(Screen)); });
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][2]).toBeNull();
  expect(read.mock.calls[0][6]).toEqual(['bank']);
  expect(value!.items).toHaveLength(6);
  expect(value!.items[0]).toMatchObject({ id: 'movement-0', isFromMandatory: true, bankName: 'Synthetic bank' });
  expect(value!.items[1]).toMatchObject({ isBankTransfer: true });
  expect(value!.items[2]).toMatchObject({ isCashRescue: true, bankName: 'Synthetic bank' });
  await act(async () => { renderer.unmount(); });
});

test('Home reports an incomplete result instead of scanning indefinitely', async () => {
  const renderer = createRoot();
  read.mockResolvedValue({ items: [], cursor: { streams: [] }, cashIncomplete: false, issues: 0 });
  let value: ReturnType<typeof useRecentMovements>;
  function Screen() { value = useRecentMovements(scope, [{ id: 'bank', name: 'Synthetic bank' }], true); return null; }
  await act(async () => { renderer.render(React.createElement(Screen)); });
  expect(read).toHaveBeenCalledTimes(3);
  expect(value!.items).toEqual([]);
  expect(value!.incomplete).toBe(true);
  await act(async () => { renderer.unmount(); });
});
