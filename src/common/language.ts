import type { SupportedLanguage } from '../auth/dto/language.dto';
import { SUPPORTED_LANGUAGES } from '../auth/dto/language.dto';

export function requestLanguage(header?: string | null): SupportedLanguage {
  const candidates = (header ?? '').split(',').map((part, index) => {
    const [tag, quality] = part.trim().split(';q=');
    return { tag: tag.toLowerCase().split('-')[0], quality: quality === undefined ? 1 : Number(quality), index };
  }).filter(item => item.quality > 0 && item.quality <= 1).sort((a, b) => b.quality - a.quality || a.index - b.index);
  return candidates.find(item => SUPPORTED_LANGUAGES.includes(item.tag as SupportedLanguage))?.tag as SupportedLanguage ?? 'es';
}
