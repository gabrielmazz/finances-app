/** [[Categorias e CDI Spark]]: a vigência é um dia civil, independente do fuso do aparelho. */
export function parseSparkCdiDay(effectiveDay: string) {
  if (typeof effectiveDay !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(effectiveDay)) throw new Error('Dia de vigência CDI inválido.');
  const [year, month, day] = effectiveDay.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1970 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Dia de vigência CDI inválido.');
  return { cycle: effectiveDay.slice(0, 7), day, dayKey: effectiveDay.replace(/-/g, '') };
}
