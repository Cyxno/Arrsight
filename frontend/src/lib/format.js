import { localeCode, t } from './i18n.js';

export function number(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '–';
  return new Intl.NumberFormat(localeCode()).format(value);
}

export function when(value) {
  if (!value) return t('unknown');
  const date = new Date(value);
  return Number.isNaN(+date) ? t('unknown') : date.toLocaleString(localeCode(), { dateStyle: 'short', timeStyle: 'short' });
}

export function bytes(value) {
  let size = Number(value || 0);
  let unit = 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  while (size >= 1024 && unit < 4) { size /= 1024; unit += 1; }
  return `${size.toLocaleString(localeCode(), { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
}

export function relTime(value) {
  if (!value) return t('unknown');
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return t('unknown');
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return localeCode() === 'nl-NL' ? 'nu' : 'now';
  if (minutes < 60) return localeCode() === 'nl-NL' ? `${minutes} min geleden` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return localeCode() === 'nl-NL' ? `${hours} u geleden` : `${hours} h ago`;
  return when(value);
}
