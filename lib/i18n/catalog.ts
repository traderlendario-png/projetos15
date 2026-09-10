import ptBR from './messages/pt-BR.json';
import ptPT from './messages/pt-PT.json';
import es419 from './messages/es-419.json';
import enUS from './messages/en-US.json';
import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

export type MessageKey = keyof typeof ptBR;
export type MessageParams = Record<string, string | number>;

const CATALOGS: Record<SupportedLocale, Record<MessageKey, string>> = {
  'pt-BR': ptBR,
  'pt-PT': ptPT,
  'es-419': es419,
  'en-US': enUS,
};

export function getCatalog(locale: SupportedLocale): Record<MessageKey, string> {
  return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
}

export function translate(locale: SupportedLocale, key: MessageKey, params: MessageParams = {}): string {
  const template = getCatalog(locale)[key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
