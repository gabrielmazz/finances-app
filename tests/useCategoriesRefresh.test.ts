import React, { act } from 'react';
import { createRoot } from 'test-renderer';
import { AppState } from 'react-native';
import { useCategories } from '../hooks/useCategories';
import { readCategorySlice } from '../firebase/categories';

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('../hooks/useCategoryScope', () => ({ useCategoryScope: () => mockScope }));
jest.mock('../firebase/client', () => ({ getFirebaseClient: () => ({}) }));
jest.mock('../firebase/categories', () => ({ readCategorySlice: jest.fn(async () => ({ items: [], cursor: null, issues: 0 })), archiveCategory: jest.fn() }));
const mockScope = { uid: 'user', kind: 'personal', id: 'user' };
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

test('an open category list stays in place until the app returns to the foreground', async () => {
  jest.useFakeTimers();
  let foreground: ((state: string) => void) | undefined;
  const remove = jest.fn();
  (AppState.addEventListener as jest.Mock).mockImplementation((_event, handler) => { foreground = handler; return { remove }; });
  const renderer = createRoot();
  function Screen() { useCategories(true, 'all'); return null; }
  try {
    await act(async () => { renderer.render(React.createElement(Screen)); });
    expect(readCategorySlice).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(readCategorySlice).toHaveBeenCalledTimes(1);
    await act(async () => { foreground?.('active'); });
    expect(readCategorySlice).toHaveBeenCalledTimes(2);
    await act(async () => { renderer.unmount(); });
    expect(remove).toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(readCategorySlice).toHaveBeenCalledTimes(2);
  } finally { jest.useRealTimers(); }
});
