import { describe, expect, it } from '@jest/globals';
import { createI18nService, translationResources } from '../../../src/i18n';

describe('I18nService', () => {
    it('returns English strings by default', () => {
        const i18n = createI18nService();
        expect(i18n.getCurrentLocale()).toBe('en');
        expect(i18n.translate('common.systemDefault')).toBe('System default');
        expect(i18n.translate('views.pomodoroStats.sections.week')).toBe('This week');
        expect(i18n.translate('views.pomodoro.buttons.start')).toBe('Start');
        expect(i18n.translate('modals.taskCreation.notices.titleRequired')).toBe('Please enter a task title');
    });

    it('switches locales and translates using fallback when key missing', () => {
        const i18n = createI18nService();
        i18n.setLocale('ja');
        expect(i18n.getCurrentLocale()).toBe('ja');
        expect(i18n.translate('common.systemDefault')).toBe('システムの既定');
        expect(i18n.translate('views.pomodoroStats.sections.week')).toBe('今週');
        expect(i18n.translate('views.pomodoro.buttons.start')).toBe('開始');
        expect(i18n.translate('modals.taskCreation.notices.titleRequired')).toBe('タスクタイトルを入力してください');

        // Non-existent key falls back to English key (returns key when no locale has it)
        expect(i18n.translate('views.nonexistent.key')).toBe('views.nonexistent.key');
    });

    it('falls back to English when unsupported locale is selected', () => {
        const i18n = createI18nService({
            initialLocale: 'fr'
        });
        expect(i18n.getCurrentLocale()).toBe('en');
        expect(i18n.translate('views.notes.title')).toBe('Notes');
    });

    it('exposes available locales from resources', () => {
        const i18n = createI18nService();
        const locales = i18n.getAvailableLocales();
        expect(locales.sort()).toEqual(Object.keys(translationResources).sort());
    });
});
