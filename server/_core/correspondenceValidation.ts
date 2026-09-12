export class InputError extends Error {}
export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export function text(value: unknown, max = 5000): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new InputError('Некорректное текстовое поле');
  const result = String(value).trim();
  if (result.length > max || result.includes('\0')) throw new InputError(`Поле превышает ${max} символов или содержит недопустимый символ`);
  return result || null;
}
export function positive(value: unknown, scale = 3): string | null {
  const source = text(value, 50);
  if (!source) return null;
  const normalized = source.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new InputError(`Некорректное число: ${source}`);
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || number > 9999999.999) throw new InputError('Число вне допустимого диапазона');
  return number.toFixed(scale);
}
export function integer(value: unknown): number | null {
  const source = text(value, 20);
  if (!source) return null;
  const number = Number(source);
  if (!/^\d+$/.test(source) || !Number.isSafeInteger(number) || number < 1 || number > 100000) throw new InputError('Количество должно быть целым положительным числом');
  return number;
}
export function date(value: unknown): string | null {
  const result = text(value, 10);
  if (!result) return null;
  const time = new Date(result + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(time.getTime()) || time.toISOString().slice(0, 10) !== result) throw new InputError(`Некорректная дата: ${result}`);
  return result;
}
export function validateSourceRows(input: unknown): Record<string, unknown>[] {
  if (!Array.isArray(input) || !input.length || input.length > MAX_ROWS) throw new InputError(`Допустимо от 1 до ${MAX_ROWS} строк`);
  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new InputError(`Некорректная строка ${index + 1}`);
    try {
      if (!text(item.waybillNumber, 50)) throw new InputError('Нет номера накладной');
      for (const field of ['manifestWeight', 'volumetricWeight', 'measuredWeight']) {
        const weight = positive(item[field]);
        if (field !== 'volumetricWeight' && weight !== null && Number(weight) <= 0) throw new InputError('Вес должен быть больше нуля или пустым');
      }
      integer(item.placesCount); date(item.waybillDate);
    } catch (cause) { throw new InputError(`Строка ${item.sourceRow || index + 1}: ${(cause as Error).message}`); }
  }
  return input;
}
