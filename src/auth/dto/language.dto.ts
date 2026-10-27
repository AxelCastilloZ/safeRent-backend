import { IsIn, IsString } from 'class-validator';

export const SUPPORTED_LANGUAGES = ['es', 'en', 'fr', 'pt'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export class UpdateLanguageDto {
  @IsString()
  @IsIn(SUPPORTED_LANGUAGES)
  preferredLanguage!: SupportedLanguage;
}
