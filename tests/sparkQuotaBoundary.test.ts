import { getSparkQuotaBoundaryRecovery } from '@/utils/sparkQuotaBoundary';
const window = 60000 * 100;
test('fronteira já atravessada permite só a janela seguinte, sem espera', () => {
  expect(getSparkQuotaBoundaryRecovery(window, window + 60010)).toEqual({ waitMs: 0, readyAt: window + 60000, window: window + 60000 });
  expect(getSparkQuotaBoundaryRecovery(window, window + 120000)).toBeNull();
  expect(getSparkQuotaBoundaryRecovery(window, window - 1)).toBeNull();
});
test('fim do minuto espera a janela seguinte com duração limitada', () => {
  expect(getSparkQuotaBoundaryRecovery(window, window + 59900)).toEqual({ waitMs: 150, readyAt: window + 60000, window: window + 60000 });
  expect(getSparkQuotaBoundaryRecovery(window, window + 59000)?.waitMs).toBe(1050);
  expect(getSparkQuotaBoundaryRecovery(window, window + 58999)).toBeNull();
});
test('começo do minuto espera estabilizar a mesma janela; relógio parado não satisfaz readyAt', () => {
  const recovery = getSparkQuotaBoundaryRecovery(window, window + 100)!;
  expect(recovery).toEqual({ waitMs: 950, readyAt: window + 1000, window });
  expect(window + 100 < recovery.readyAt).toBe(true);
  expect(getSparkQuotaBoundaryRecovery(window, window + 1000)).toBeNull();
});
