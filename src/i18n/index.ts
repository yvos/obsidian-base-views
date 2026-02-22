import { I18nService } from "./I18nService";
import type { I18nServiceOptions } from "./types";
import { TranslationResources } from "./types";
import { en } from "./resources/en";
import { ja } from "./resources/ja";

export const translationResources = {
	en,
	ja,
} satisfies TranslationResources;

export type TranslationKey = string;

export function createI18nService(options?: Partial<I18nServiceOptions>): I18nService {
	return new I18nService({
		resources: translationResources,
		defaultLocale: "en",
		fallbackLocale: "en",
		...options,
	});
}

export { I18nService };
