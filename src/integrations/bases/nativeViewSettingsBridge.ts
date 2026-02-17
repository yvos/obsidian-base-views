import {
	NativeViewSettingsOpenResult,
	OpenNativeViewSettingsAtAnchorParams,
} from "./types";

const VIEWS_TRIGGER_SELECTOR = ".bases-toolbar-views-menu";
const MENU_SELECTOR = ".menu";
const MENU_ITEM_SELECTOR = ".menu-item, .bases-toolbar-menu-item";
const MENU_ITEM_TITLE_SELECTOR = ".menu-item-title, .bases-toolbar-menu-item-name";
const DEFAULT_NATIVE_TOOLBAR_HIDDEN_CLASS = "tn-bases-native-toolbar-hidden";
const NATIVE_VIEWS_MENU_CLASS = "bases-toolbar-views-menu";
const NATIVE_SETTINGS_STATE_SELECTORS = [
	".view-config-menu",
	".bases-toolbar-menu-form",
	".bases-toolbar-menu-container-header .back-button",
];

const CHEVRON_SELECTORS = [
	"[data-icon='chevron-right']",
	".menu-item-chevron",
	".menu-item-submenu-chevron",
	".menu-item-icon.mod-submenu",
	".menu-item-icon.mod-chevron",
	".menu-item-icon.mod-right",
	".bases-toolbar-menu-item-icon",
	".lucide-chevron-right",
	"[class*='chevron']",
	"[aria-haspopup='menu']",
	"[aria-expanded]",
];

interface Point {
	x: number;
	y: number;
}

function normalizeText(value: string): string {
	return value
		.normalize("NFKC")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function getElementPoint(el: HTMLElement): Point {
	const rect = el.getBoundingClientRect();
	if (Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
		const x = rect.left + Math.max(0, rect.width) / 2;
		const y = rect.top + Math.max(0, rect.height) / 2;
		return { x, y };
	}
	return { x: 0, y: 0 };
}

function getVisibleMenus(doc: Document): HTMLElement[] {
	return Array.from(doc.querySelectorAll<HTMLElement>(MENU_SELECTOR)).filter((menuEl) => {
		if (!menuEl.isConnected) return false;
		if (menuEl.getAttribute("aria-hidden") === "true") return false;
		const style = menuEl.style;
		if (style.display === "none" || style.visibility === "hidden") return false;
		return true;
	});
}

function findNativeViewsMenu(menus: HTMLElement[]): HTMLElement | null {
	for (let index = menus.length - 1; index >= 0; index -= 1) {
		const menuEl = menus[index];
		if (menuEl.classList.contains(NATIVE_VIEWS_MENU_CLASS)) {
			return menuEl;
		}
	}
	return null;
}

function isSettingsStateMenu(menuEl: HTMLElement): boolean {
	if (!menuEl.isConnected) return false;
	for (const selector of NATIVE_SETTINGS_STATE_SELECTORS) {
		if (menuEl.querySelector(selector)) {
			return true;
		}
	}
	return false;
}

function resolveTriggerTarget(triggerHost: HTMLElement): HTMLElement {
	return (
		triggerHost.querySelector<HTMLElement>(
			"button, .clickable-icon, .text-icon-button, [role='button']"
		) ?? triggerHost
	);
}

function dispatchMouseLikeEvent(target: HTMLElement, type: string, point: Point): void {
	const view = target.ownerDocument?.defaultView ?? window;
	const eventInit = {
		bubbles: true,
		cancelable: true,
		view,
		clientX: point.x,
		clientY: point.y,
		screenX: point.x,
		screenY: point.y,
	};
	if (type.startsWith("pointer") && typeof PointerEvent === "function") {
		target.dispatchEvent(
			new PointerEvent(type, {
				...eventInit,
				pointerId: 1,
				pointerType: "mouse",
				isPrimary: true,
			})
		);
		return;
	}
	target.dispatchEvent(new MouseEvent(type, eventInit));
}

function dispatchPointerClick(target: HTMLElement, point: Point): void {
	dispatchMouseLikeEvent(target, "pointerdown", point);
	dispatchMouseLikeEvent(target, "mousedown", point);
	dispatchMouseLikeEvent(target, "pointerup", point);
	dispatchMouseLikeEvent(target, "mouseup", point);
	dispatchMouseLikeEvent(target, "click", point);
}

function dispatchKeyEvent(target: HTMLElement, key: string): void {
	const view = target.ownerDocument?.defaultView ?? window;
	target.dispatchEvent(
		new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key,
			code: key,
			view,
		})
	);
}

async function waitFor<T>(
	factory: () => T | null | undefined,
	attempts = 12,
	delayMs = 16
): Promise<T | null> {
	for (let i = 0; i < attempts; i += 1) {
		const value = factory();
		if (value != null) return value;
		await new Promise((resolve) => window.setTimeout(resolve, delayMs));
	}
	return null;
}

function resolveViewRow(menuEl: HTMLElement, viewName: string): HTMLElement | null {
	const targetName = normalizeText(viewName);
	if (!targetName) return null;

	const items = Array.from(menuEl.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
	let bestMatch: { el: HTMLElement; score: number } | null = null;

	for (const itemEl of items) {
		const titleEl = itemEl.querySelector<HTMLElement>(MENU_ITEM_TITLE_SELECTOR);
		const rawText = titleEl?.textContent ?? itemEl.textContent ?? "";
		const text = normalizeText(rawText);
		if (!text) continue;

		let score = 0;
		if (text === targetName) score = 3;
		else if (text.includes(targetName)) score = 2;
		else if (targetName.includes(text) && text.length > 0) score = 1;
		if (score === 0) continue;

		if (!bestMatch || score > bestMatch.score) {
			bestMatch = { el: itemEl, score };
		}
	}

	return bestMatch?.el ?? null;
}

function resolveChevronTarget(rowEl: HTMLElement): HTMLElement | null {
	const selector = CHEVRON_SELECTORS.join(", ");
	const node = rowEl.querySelector<HTMLElement>(selector);
	if (!node) return null;
	return node.closest<HTMLElement>("button, [role='button'], div, span") ?? node;
}

async function openViewsMenu(
	triggerEl: HTMLElement,
	anchorPoint: Point,
	beforeMenusCount: number
): Promise<HTMLElement | null> {
	const doc = triggerEl.ownerDocument;
	dispatchPointerClick(triggerEl, anchorPoint);
	return waitFor(() => {
		const menus = getVisibleMenus(doc);
		if (menus.length === 0) return null;
		const nativeMenu = findNativeViewsMenu(menus);
		if (nativeMenu) return nativeMenu;
		if (menus.length > beforeMenusCount) {
			return menus[menus.length - 1] ?? null;
		}
		return menus[menus.length - 1] ?? null;
	}, 20, 20);
}

async function waitForSettingsOpened(
	doc: Document,
	beforeMenusCount: number,
	openedMenu: HTMLElement
): Promise<boolean> {
	const opened = await waitFor(() => {
		const menus = getVisibleMenus(doc);
		if (menus.length > beforeMenusCount) return true;
		if (menus.includes(openedMenu) && isSettingsStateMenu(openedMenu)) return true;
		const nativeMenu = findNativeViewsMenu(menus);
		if (nativeMenu && isSettingsStateMenu(nativeMenu)) return true;
		return null;
	}, 20, 20);
	return opened === true;
}

function focusRow(rowEl: HTMLElement): void {
	if (typeof rowEl.focus !== "function") return;
	if (!rowEl.hasAttribute("tabindex")) {
		rowEl.setAttribute("tabindex", "-1");
	}
	rowEl.focus();
}

async function tryOpenSettingsFromRow(
	rowEl: HTMLElement,
	anchorPoint: Point,
	openedMenu: HTMLElement
): Promise<"opened-settings" | "opened-view-list-only"> {
	const doc = rowEl.ownerDocument;

	const beforeClickMenusCount = getVisibleMenus(doc).length;
	const chevronTarget = resolveChevronTarget(rowEl);
	if (chevronTarget) {
		dispatchPointerClick(chevronTarget, anchorPoint);
		if (await waitForSettingsOpened(doc, beforeClickMenusCount, openedMenu)) {
			return "opened-settings";
		}
	}

	const beforeArrowMenusCount = getVisibleMenus(doc).length;
	focusRow(rowEl);
	dispatchKeyEvent(rowEl, "ArrowRight");
	if (await waitForSettingsOpened(doc, beforeArrowMenusCount, openedMenu)) {
		return "opened-settings";
	}

	const beforeClickArrowMenusCount = getVisibleMenus(doc).length;
	dispatchPointerClick(rowEl, anchorPoint);
	dispatchKeyEvent(rowEl, "ArrowRight");
	if (await waitForSettingsOpened(doc, beforeClickArrowMenusCount, openedMenu)) {
		return "opened-settings";
	}

	return "opened-view-list-only";
}

export async function openNativeViewSettingsAtAnchor(
	params: OpenNativeViewSettingsAtAnchorParams
): Promise<NativeViewSettingsOpenResult> {
	const rootEl = params.rootEl;
	const anchorEl = params.anchorEl;
	const viewName = params.viewName?.trim();
	if (!rootEl || !anchorEl || !viewName) {
		return { status: "failed", reason: "invalid-params" };
	}

	const hiddenClass =
		params.nativeToolbarHiddenClass?.trim() || DEFAULT_NATIVE_TOOLBAR_HIDDEN_CLASS;
	const wasHidden = rootEl.classList.contains(hiddenClass);
	if (wasHidden) {
		rootEl.classList.remove(hiddenClass);
	}

	try {
		const triggerHost = rootEl.querySelector<HTMLElement>(VIEWS_TRIGGER_SELECTOR);
		if (!triggerHost) {
			return { status: "failed", reason: "views-trigger-missing" };
		}

		const triggerEl = resolveTriggerTarget(triggerHost);
		const anchorPoint = getElementPoint(anchorEl);
		const beforeMenusCount = getVisibleMenus(rootEl.ownerDocument).length;
		const openedMenu = await openViewsMenu(triggerEl, anchorPoint, beforeMenusCount);
		if (!openedMenu) {
			return { status: "failed", reason: "views-menu-not-opened" };
		}

		const rowEl = resolveViewRow(openedMenu, viewName);
		if (!rowEl) {
			return { status: "opened-view-list-only", reason: "view-row-not-found" };
		}

		const result = await tryOpenSettingsFromRow(rowEl, anchorPoint, openedMenu);
		if (result === "opened-settings") {
			return { status: "opened-settings" };
		}
		return { status: "opened-view-list-only", reason: "view-settings-not-opened" };
	} catch {
		return { status: "failed", reason: "bridge-error" };
	} finally {
		if (wasHidden) {
			rootEl.classList.add(hiddenClass);
		}
	}
}
