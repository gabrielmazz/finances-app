/** Agregados da Home também precisam conservar centavos inteiros. */
export function addHomeCents(left: number, right: number): number {
  const result = left + right;
  if (![left, right, result].every(Number.isSafeInteger)) throw new Error('O total da Home excede o limite de centavos inteiros.');
  return result;
}
