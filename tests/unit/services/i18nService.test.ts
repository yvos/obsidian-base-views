import { describe, expect, it } from '@jest/globals';
import { createI18nService, translationResources } from '../../../src/i18n';

const getResourceString = (locale: keyof typeof translationResources, key: string): string => {
	const value = key.split('.').reduce<unknown>((current, segment) => {
		if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
			return (current as Record<string, unknown>)[segment];
		}
		return undefined;
	}, translationResources[locale]);
	return typeof value === 'string' ? value : key;
};

describe('I18nService', () => {
	it('returns English strings by default', () => {
		const i18n = createI18nService();
		expect(i18n.getCurrentLocale()).toBe('en');
		expect(i18n.translate('common.systemDefault')).toBe(getResourceString('en', 'common.systemDefault'));
		expect(i18n.translate('views.taskList.title')).toBe(getResourceString('en', 'views.taskList.title'));
		expect(i18n.translate('modals.taskCreation.notices.titleRequired')).toBe(
			getResourceString('en', 'modals.taskCreation.notices.titleRequired')
		);
	});

	it('switches locales and translates using fallback when key missing', () => {
		const i18n = createI18nService();
		i18n.setLocale('ja');
		expect(i18n.getCurrentLocale()).toBe('ja');
		expect(i18n.translate('common.systemDefault')).toBe(getResourceString('ja', 'common.systemDefault'));
		expect(i18n.translate('views.taskList.title')).toBe(getResourceString('ja', 'views.taskList.title'));
		expect(i18n.translate('modals.taskCreation.notices.titleRequired')).toBe(
			getResourceString('ja', 'modals.taskCreation.notices.titleRequired')
		);

		// Non-existent key falls back to key itself when neither locale provides it.
		expect(i18n.translate('views.nonexistent.key')).toBe('views.nonexistent.key');
	});

	it('falls back to English when unsupported locale is selected', () => {
		const i18n = createI18nService({
			initialLocale: 'fr'
		});
		expect(i18n.getCurrentLocale()).toBe('en');
		expect(i18n.translate('views.notes.title')).toBe(getResourceString('en', 'views.notes.title'));
	});

	it('exposes available locales from resources', () => {
		const i18n = createI18nService();
		const locales = i18n.getAvailableLocales();
		expect(locales.sort()).toEqual(Object.keys(translationResources).sort());
	});
});
