import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteVisibilityProvider, useRouteVisibility } from '@/contexts/RouteVisibilityContext';
import { APP_ROUTE_GUARD_ENTRIES, isAppRouteAllowed } from '@/utils/appRouteGuards';
import {
	APP_ROUTE_PATHS, getVisibleHomeTab, getPostSubmitDestinationVisibilityKey,
} from '@/utils/navigation';

jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }));
jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('expo-router', () => ({ router: {} }));

const setItemImplementation = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
const storageKey = '@finances/route-visibility:screen-validation-v1';
const legacyKey = '@finances/route-visibility';
const wrapper = ({ children }: React.PropsWithChildren) => React.createElement(RouteVisibilityProvider, null, children);
beforeEach(async () => {
  jest.mocked(AsyncStorage.setItem).mockImplementation(setItemImplementation);
  await AsyncStorage.clear(); jest.clearAllMocks();
});

it('starts closed despite legacy choices, persists one enabled screen and can disable all without deleting legacy data', async () => {
	const legacy = JSON.stringify({ addRegisterBank: true, lumusAssistant: true });
	await AsyncStorage.setItem(legacyKey, legacy);
	const first = await renderHook(useRouteVisibility, { wrapper });
	expect(first.result.current.isLoadingRouteVisibility).toBe(false);
	expect(first.result.current.isRouteVisible('addRegisterBank')).toBe(false);
	expect(first.result.current.isRouteVisible('homeDashboard')).toBe(true);
	await act(async () => first.result.current.setRouteVisibility('addRegisterBank', true));
	expect(first.result.current.isRouteVisible('addRegisterBank')).toBe(true);
	expect(first.result.current.isRouteVisible('addRegisterExpenses')).toBe(true);
	await first.unmount();
	const second = await renderHook(useRouteVisibility, { wrapper });
	expect(second.result.current.isRouteVisible('addRegisterBank')).toBe(true);
	await act(async () => second.result.current.hideAllRoutes());
	expect(Object.values(JSON.parse((await AsyncStorage.getItem(storageKey))!))).not.toContain(true);
	expect(await AsyncStorage.getItem(legacyKey)).toBe(legacy);
	await second.unmount();
	const third = await renderHook(useRouteVisibility, { wrapper });
	expect(third.result.current.isRouteVisible('addRegisterBank')).toBe(false);
	await third.unmount();
});

it('uses a closed baseline on corrupt storage and allows enabling a screen afterwards', async () => {
	await AsyncStorage.setItem(storageKey, '{invalid');
	const error = jest.spyOn(console, 'error').mockImplementation(() => {});
	try {
		const { result, unmount } = await renderHook(useRouteVisibility, { wrapper });
		expect(result.current.isLoadingRouteVisibility).toBe(false);
		expect(result.current.isRouteVisible('bankMovements')).toBe(false);
		await act(async () => result.current.setRouteVisibility('bankMovements', true));
		expect(result.current.isRouteVisible('bankMovements')).toBe(true);
		await unmount();
	} finally { error.mockRestore(); }
});

it('keeps configuration reachable and blocks functional deep links in the initial state', () => {
	const entries = APP_ROUTE_GUARD_ENTRIES.filter(entry => entry.isActivePlatform && !entry.isLogin);
	const allowed = entries.filter(entry => isAppRouteAllowed(entry, true, () => false)).map(entry => entry.pathname);
	expect(allowed.sort()).toEqual([APP_ROUTE_PATHS.home, APP_ROUTE_PATHS.bankSummary, APP_ROUTE_PATHS.screenSettings].sort());
	const banks = entries.find(entry => entry.pathname === APP_ROUTE_PATHS.addRegisterBank)!;
	expect(isAppRouteAllowed(banks, true, key => key === 'addRegisterBank')).toBe(true);
	expect(isAppRouteAllowed(banks, false, () => true)).toBe(false);
});

it('resolves hidden Home tabs without mounting them or redirecting in a loop', () => {
	expect(getVisibleHomeTab(0, () => false)).toBe(2);
	expect(getVisibleHomeTab(1, () => false)).toBe(2);
	expect(getVisibleHomeTab(2, () => false)).toBe(2);
	expect(getVisibleHomeTab(1, key => key === 'homeDashboard')).toBe(0);
	expect(getVisibleHomeTab(0, key => key === 'homeDashboard')).toBe(0);
	expect(getVisibleHomeTab(1, key => key === 'addRegisterExpenses')).toBe(1);
});

it('treats Dashboard and inline Control as configurable post-submit destinations', () => {
	expect(getPostSubmitDestinationVisibilityKey('homeDashboard')).toBe('homeDashboard');
	expect(getPostSubmitDestinationVisibilityKey('homeControl')).toBe('addRegisterExpenses');
	expect(getPostSubmitDestinationVisibilityKey('homeConfigurations')).toBeNull();
	expect(getPostSubmitDestinationVisibilityKey('categoryAnalysis')).toBe('categoryAnalysis');
});

it('enables advanced screens once, preserving unrelated choices and a later manual disable', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ addRegisterGain: false, addRegisterExpenses: false, addRegisterBank: true, homeDashboard: false }));
  const first = await renderHook(useRouteVisibility, { wrapper });
  expect(first.result.current.isRouteVisible('addRegisterGain')).toBe(true);
  expect(first.result.current.isRouteVisible('addRegisterExpenses')).toBe(true);
  expect(first.result.current.isRouteVisible('addRegisterBank')).toBe(true);
  expect(first.result.current.isRouteVisible('homeDashboard')).toBe(true);
  await act(async () => first.result.current.setRouteVisibility('addRegisterGain', false));
  await first.unmount();
  const second = await renderHook(useRouteVisibility, { wrapper });
  expect(second.result.current.isRouteVisible('addRegisterGain')).toBe(false);
  expect(second.result.current.isRouteVisible('addRegisterExpenses')).toBe(true);
  await second.unmount();
});

it('a corrupt release marker preserves valid visibility choices', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ addRegisterBank: true, homeDashboard: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', '{invalid');
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { result, unmount } = await renderHook(useRouteVisibility, { wrapper });
    expect(result.current.isRouteVisible('addRegisterBank')).toBe(true);
    expect(result.current.isRouteVisible('addRegisterGain')).toBe(true);
    expect(result.current.isRouteVisible('homeDashboard')).toBe(true);
    await unmount();
  } finally { error.mockRestore(); }
});

it('failed preference persistence does not mark the release applied or reset other choices', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ addRegisterBank: true }));
  const write = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage unavailable'));
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { result, unmount } = await renderHook(useRouteVisibility, { wrapper });
    expect(result.current.isRouteVisible('addRegisterBank')).toBe(true);
    expect(result.current.isRouteVisible('addRegisterExpenses')).toBe(true);
    expect(await AsyncStorage.getItem('@finances/route-visibility:screen-validation-applied-v1')).toBeNull();
    await unmount();
  } finally { write.mockRestore(); error.mockRestore(); }
});


it('upgrades an existing release by opening only the statement and dashboard and honors subsequent disables', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ addRegisterGain: false, addRegisterBank: true, homeDashboard: false, bankMovements: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'financial-forecast-2026-10-24']));
  const first = await renderHook(useRouteVisibility, { wrapper });
  expect(first.result.current.isRouteVisible('homeDashboard')).toBe(true);
  expect(first.result.current.isRouteVisible('bankMovements')).toBe(true);
  expect({ gains: first.result.current.isRouteVisible('addRegisterGain'), bank: first.result.current.isRouteVisible('addRegisterBank'), forecast: first.result.current.isRouteVisible('financialForecast') }).toEqual({ gains: false, bank: true, forecast: false });
  expect(first.result.current.isRouteVisible('addRegisterBank')).toBe(true);
  expect(first.result.current.isRouteVisible('financialForecast')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('bankMovements', false));
  await act(async () => first.result.current.setRouteVisibility('homeDashboard', false));
  await first.unmount();
  const second = await renderHook(useRouteVisibility, { wrapper });
  expect(second.result.current.isRouteVisible('homeDashboard')).toBe(false);
  expect(second.result.current.isRouteVisible('bankMovements')).toBe(false);
  await second.unmount();
});


it('enables transfer only once and preserves previously disabled screens', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ transferScreen: false, homeDashboard: false, addRegisterGain: false, addRescue: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'withdrawal-2026-10-23']));
  const first = await renderHook(useRouteVisibility, { wrapper });
  expect(first.result.current.isRouteVisible('transferScreen')).toBe(true);
  expect(first.result.current.isRouteVisible('addRescue')).toBe(false);
  expect(first.result.current.isRouteVisible('homeDashboard')).toBe(false);
  expect(first.result.current.isRouteVisible('addRegisterGain')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('transferScreen', false));
  await first.unmount();
  const second = await renderHook(useRouteVisibility, { wrapper });
  expect(second.result.current.isRouteVisible('transferScreen')).toBe(false);
  await second.unmount();
});


it('enables withdrawal once while preserving transfer and adjustment preferences', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ transferScreen: false, addRescue: false, bankBalanceAdjustment: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'transfer-2026-10-23', 'balance-adjustment-2026-10-23']));
  const first = await renderHook(useRouteVisibility, { wrapper });
  expect(first.result.current.isRouteVisible('addRescue')).toBe(true);
  expect(first.result.current.isRouteVisible('transferScreen')).toBe(false);
  expect(first.result.current.isRouteVisible('bankBalanceAdjustment')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('addRescue', false)); await first.unmount();
  const second = await renderHook(useRouteVisibility, { wrapper });
  expect(second.result.current.isRouteVisible('addRescue')).toBe(false); await second.unmount();
});

it('enables balance adjustment once and preserves the previously disabled routes', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ bankBalanceAdjustment: false, transferScreen: false, addRescue: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'transfer-2026-10-23', 'withdrawal-2026-10-23']));
  const first = await renderHook(useRouteVisibility, { wrapper });
  expect(first.result.current.isRouteVisible('bankBalanceAdjustment')).toBe(true);
  expect(first.result.current.isRouteVisible('transferScreen')).toBe(false); expect(first.result.current.isRouteVisible('addRescue')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('bankBalanceAdjustment', false)); await first.unmount();
  const second = await renderHook(useRouteVisibility, { wrapper }); expect(second.result.current.isRouteVisible('bankBalanceAdjustment')).toBe(false); await second.unmount();
});

it('releases recurring expense form and list once while preserving gains and previous disables', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ addMandatoryExpenses: false, mandatoryExpenses: false, addMandatoryGains: false, mandatoryGains: false, addRescue: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'transfer-2026-10-23', 'withdrawal-2026-10-23', 'balance-adjustment-2026-10-23', 'recurring-gains-2026-10-23']));
  const first = await renderHook(useRouteVisibility, { wrapper });
  expect(first.result.current.isRouteVisible('addMandatoryExpenses')).toBe(true);
  expect(first.result.current.isRouteVisible('addMandatoryGains')).toBe(false); expect(first.result.current.isRouteVisible('addRescue')).toBe(false);
  await act(async () => { first.result.current.setRouteVisibility('addMandatoryExpenses', false); }); await first.unmount();
  const second = await renderHook(useRouteVisibility, { wrapper }); expect(second.result.current.isRouteVisible('addMandatoryExpenses')).toBe(false); await second.unmount();
});

it('releases recurring gains once without reopening expenses or unrelated routes', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ addMandatoryGains: false, addMandatoryExpenses: false, homeDashboard: false, addInvestment: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'transfer-2026-10-23', 'withdrawal-2026-10-23', 'balance-adjustment-2026-10-23', 'recurring-expenses-2026-10-23']));
  const first = await renderHook(useRouteVisibility, { wrapper });
  expect(first.result.current.isRouteVisible('addMandatoryGains')).toBe(true); expect(first.result.current.isRouteVisible('addMandatoryExpenses')).toBe(false); expect(first.result.current.isRouteVisible('homeDashboard')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('addMandatoryGains', false)); await first.unmount();
  const second = await renderHook(useRouteVisibility, { wrapper }); expect(second.result.current.isRouteVisible('addMandatoryGains')).toBe(false); await second.unmount();
});

it('releases investment form and portfolio once and preserves other choices', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ addFinance: false, addMandatoryGains: false, homeDashboard: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'transfer-2026-10-23', 'withdrawal-2026-10-23', 'balance-adjustment-2026-10-23', 'recurring-expenses-2026-10-23', 'recurring-gains-2026-10-23']));
  const first = await renderHook(useRouteVisibility, { wrapper }); expect(first.result.current.isRouteVisible('addFinance')).toBe(true); expect(first.result.current.isRouteVisible('addMandatoryGains')).toBe(false); expect(first.result.current.isRouteVisible('homeDashboard')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('addFinance', false)); await first.unmount(); const second = await renderHook(useRouteVisibility, { wrapper }); expect(second.result.current.isRouteVisible('addFinance')).toBe(false); await second.unmount();
});

it('releases category analysis once and preserves investment and forecast choices', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ categoryAnalysis: false, addFinance: false, financialForecast: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'transfer-2026-10-23', 'withdrawal-2026-10-23', 'balance-adjustment-2026-10-23', 'recurring-expenses-2026-10-23', 'recurring-gains-2026-10-23', 'investments-2026-10-23', 'financial-forecast-2026-10-24']));
  const first = await renderHook(useRouteVisibility, { wrapper }); expect(first.result.current.isRouteVisible('categoryAnalysis')).toBe(true); expect(first.result.current.isRouteVisible('addFinance')).toBe(false); expect(first.result.current.isRouteVisible('financialForecast')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('categoryAnalysis', false)); await first.unmount(); const second = await renderHook(useRouteVisibility, { wrapper }); expect(second.result.current.isRouteVisible('categoryAnalysis')).toBe(false); await second.unmount();
});

it('releases financial forecast once without reopening analysis or other routes', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ financialForecast: false, categoryAnalysis: false, addFinance: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'transfer-2026-10-23', 'withdrawal-2026-10-23', 'balance-adjustment-2026-10-23', 'recurring-expenses-2026-10-23', 'recurring-gains-2026-10-23', 'investments-2026-10-23', 'category-analysis-2026-10-23']));
  const first = await renderHook(useRouteVisibility, { wrapper }); expect(first.result.current.isRouteVisible('financialForecast')).toBe(true); expect(first.result.current.isRouteVisible('categoryAnalysis')).toBe(false); expect(first.result.current.isRouteVisible('addFinance')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('financialForecast', false)); await first.unmount(); const second = await renderHook(useRouteVisibility, { wrapper }); expect(second.result.current.isRouteVisible('financialForecast')).toBe(false); await second.unmount();
});

it('releases profile once and keeps relationship and other screens disabled', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ profile: false, addUserRelation: false, financialForecast: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'transfer-2026-10-23', 'withdrawal-2026-10-23', 'balance-adjustment-2026-10-23', 'recurring-expenses-2026-10-23', 'recurring-gains-2026-10-23', 'investments-2026-10-23', 'category-analysis-2026-10-23', 'financial-forecast-2026-10-24', 'user-relationships-2026-10-24']));
  const first = await renderHook(useRouteVisibility, { wrapper }); expect(first.result.current.isRouteVisible('profile')).toBe(true); expect(first.result.current.isRouteVisible('addUserRelation')).toBe(false); expect(first.result.current.isRouteVisible('financialForecast')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('profile', false)); await first.unmount(); const second = await renderHook(useRouteVisibility, { wrapper }); expect(second.result.current.isRouteVisible('profile')).toBe(false); await second.unmount();
});

it('releases relationships once without reopening profile, annotations or assistant', async () => {
  await AsyncStorage.setItem(storageKey, JSON.stringify({ addUserRelation: false, profile: false, annotations: false, lumusAssistant: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(['gains-expenses-2026-10-23', 'statement-dashboard-2026-10-23', 'transfer-2026-10-23', 'withdrawal-2026-10-23', 'balance-adjustment-2026-10-23', 'recurring-expenses-2026-10-23', 'recurring-gains-2026-10-23', 'investments-2026-10-23', 'category-analysis-2026-10-23', 'financial-forecast-2026-10-24', 'profile-2026-10-24', 'annotations-2026-10-25']));
  const first = await renderHook(useRouteVisibility, { wrapper });
  expect(first.result.current.isRouteVisible('addUserRelation')).toBe(true); expect(first.result.current.isRouteVisible('profile')).toBe(false); expect(first.result.current.isRouteVisible('annotations')).toBe(false); expect(first.result.current.isRouteVisible('lumusAssistant')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('addUserRelation', false)); await first.unmount();
  const second = await renderHook(useRouteVisibility, { wrapper }); expect(second.result.current.isRouteVisible('addUserRelation')).toBe(false); await second.unmount();
});


it('releases annotations once and preserves other choices and subsequent disable', async () => {
  const { applyScreenValidationReleases } = require('@/contexts/RouteVisibilityContext');
  const prior = applyScreenValidationReleases({}, []).appliedIds.filter((id: string) => id !== 'annotations-2026-10-25');
  await AsyncStorage.setItem(storageKey, JSON.stringify({ annotations: false, addUserRelation: false, lumusAssistant: false }));
  await AsyncStorage.setItem('@finances/route-visibility:screen-validation-applied-v1', JSON.stringify(prior));
  const first = await renderHook(useRouteVisibility, { wrapper });
  expect(first.result.current.isRouteVisible('annotations')).toBe(true);
  expect(first.result.current.isRouteVisible('addUserRelation')).toBe(false);
  expect(first.result.current.isRouteVisible('lumusAssistant')).toBe(false);
  await act(async () => first.result.current.setRouteVisibility('annotations', false)); await first.unmount();
  const second = await renderHook(useRouteVisibility, { wrapper });
  expect(second.result.current.isRouteVisible('annotations')).toBe(false); await second.unmount();
});
