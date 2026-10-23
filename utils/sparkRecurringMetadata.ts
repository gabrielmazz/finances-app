export type SparkRecurringMetadata = {
  dueDay: number | null; usesBusinessDays: boolean; description: string | null;
  reminderConfigVersion: 1; reminderEnabled: boolean; reminderDaysBefore: number;
  reminderOnDueDate: boolean; reminderHour: number; reminderMinute: number;
};
export function validateSparkRecurringMetadata(value: SparkRecurringMetadata): SparkRecurringMetadata {
  const keys = ['dueDay', 'usesBusinessDays', 'description', 'reminderConfigVersion', 'reminderEnabled', 'reminderDaysBefore', 'reminderOnDueDate', 'reminderHour', 'reminderMinute'];
  const integer = (item: unknown, low: number, high: number) => Number.isInteger(item) && (item as number) >= low && (item as number) <= high;
  if (!value || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
    || !(value.dueDay === null || integer(value.dueDay, 1, 31)) || typeof value.usesBusinessDays !== 'boolean'
    || !(value.description === null || typeof value.description === 'string' && value.description.length <= 2000)
    || value.reminderConfigVersion !== 1 || typeof value.reminderEnabled !== 'boolean' || typeof value.reminderOnDueDate !== 'boolean'
    || !integer(value.reminderDaysBefore, 0, 3) || !integer(value.reminderHour, 0, 23) || !integer(value.reminderMinute, 0, 59)
    || value.reminderEnabled && (value.dueDay === null || value.reminderDaysBefore === 0 && !value.reminderOnDueDate)) throw new Error('Metadados da recorrência inválidos.');
  return { ...value };
}
