import { isNumber } from './comparisons.ts';

export const kSecondMs = 1000;
export const kMinuteMs = 60 * kSecondMs;
export const kHourMs = 60 * kMinuteMs;
export const kDayMs = 24 * kHourMs;
export const kWeekMs = 7 * kDayMs;

export function serializeDate(date: Date): number {
  if (date instanceof Date) {
    return date.getTime() / 1000;
  } else if (isNumber(date)) {
    return date;
  }
  throw new Error('Unsupported date value');
}

export function deserializeDate(d: number | string | Date): Date {
  if (typeof d === 'string') {
    d = parseFloat(d);
  }
  if (typeof d === 'number') {
    const r = new Date();
    if (d < 1000000000000) {
      d *= 1000;
    }
    r.setTime(d);
    return r;
  } else if (d instanceof Date) {
    return d;
  }
  throw new Error('Unsupported date value');
}

export function formatTimeDiff(date: Date) {
  const now = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  if (year === now.getFullYear()) {
    if (month === now.getMonth()) {
      const daysDiff = now.getDate() - day;
      if (daysDiff === 0) {
        return 'Today';
      }
      if (daysDiff === 1) {
        return 'Yesterday';
      }
    }
  }

  return date.toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });
}

export function numberOfDaysInCurrentMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function numberOfDaysLeftInCurrentMonth(): number {
  const today = startOfToday();
  const startOfNextMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    1
  );
  return Math.round((startOfNextMonth.getTime() - today.getTime()) / kDayMs);
}

export function startOfDay(d: Date): Date {
  d.setTime(
    d.getTime() -
      d.getUTCHours() * kHourMs -
      d.getUTCMinutes() * kMinuteMs -
      d.getUTCSeconds() * kSecondMs -
      d.getUTCMilliseconds() +
      d.getTimezoneOffset() * kMinuteMs
  );
  return d;
}

export function startOfToday(): Date {
  return startOfDay(new Date());
}

export function startOfThisMonth(): Date {
  const d = startOfToday();
  d.setTime(d.getTime() - (d.getUTCDate() - 1) * kDayMs);
  return d;
}

export function startOfThisWeek(): Date {
  const d = startOfToday();
  d.setTime(d.getTime() - d.getDay() * kDayMs);
  return d;
}

export function numberOfWorkDaysLeftInWeek(): number {
  return Math.max(0, 6 - new Date().getDay() - 1);
}

export function numberOfWorkDaysLeftInMonth(): number {
  return numberOfDaysInCurrentMonth() - (new Date().getDate() - 1);
}
