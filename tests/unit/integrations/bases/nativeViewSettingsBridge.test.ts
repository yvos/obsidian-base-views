import { openNativeViewSettingsAtAnchor } from "../../../../src/integrations/bases/nativeViewSettingsBridge";

function createRootWithViewsTrigger(): {
	rootEl: HTMLElement;
	triggerButtonEl: HTMLButtonElement;
	anchorEl: HTMLButtonElement;
} {
	const rootEl = document.createElement("div");
	rootEl.className = "view-content";
	document.body.appendChild(rootEl);

	const toolbarEl = document.createElement("div");
	toolbarEl.className = "bases-toolbar";
	rootEl.appendChild(toolbarEl);

	const viewsMenuEl = document.createElement("div");
	viewsMenuEl.className = "bases-toolbar-item bases-toolbar-views-menu";
	toolbarEl.appendChild(viewsMenuEl);

	const triggerButtonEl = document.createElement("button");
	triggerButtonEl.type = "button";
	triggerButtonEl.className = "text-icon-button";
	viewsMenuEl.appendChild(triggerButtonEl);

	const anchorEl = document.createElement("button");
	anchorEl.type = "button";
	anchorEl.className = "anchor";
	rootEl.appendChild(anchorEl);

	return { rootEl, triggerButtonEl, anchorEl };
}

function appendNativeViewListMenu(
	viewName: string,
	options?: { withChevron?: boolean; openSettingsOnChevron?: boolean }
): HTMLElement {
	const withChevron = options?.withChevron !== false;
	const openSettingsOnChevron = options?.openSettingsOnChevron !== false;

	const menuEl = document.createElement("div");
	menuEl.className = "menu bases-toolbar-menu bases-toolbar-views-menu";
	document.body.appendChild(menuEl);

	const scrollEl = document.createElement("div");
	scrollEl.className = "menu-scroll";
	menuEl.appendChild(scrollEl);

	const containerEl = document.createElement("div");
	containerEl.className = "bases-toolbar-menu-container";
	scrollEl.appendChild(containerEl);

	const itemsEl = document.createElement("div");
	itemsEl.className = "bases-toolbar-items";
	containerEl.appendChild(itemsEl);

	const groupEl = document.createElement("div");
	groupEl.className = "suggestion-group";
	itemsEl.appendChild(groupEl);

	const rowEl = document.createElement("div");
	rowEl.className = "suggestion-item bases-toolbar-menu-item";
	groupEl.appendChild(rowEl);

	const infoEl = document.createElement("div");
	infoEl.className = "bases-toolbar-menu-item-info";
	rowEl.appendChild(infoEl);

	const titleEl = document.createElement("div");
	titleEl.className = "bases-toolbar-menu-item-name";
	titleEl.textContent = viewName;
	infoEl.appendChild(titleEl);

	if (withChevron) {
		const chevronEl = document.createElement("div");
		chevronEl.className = "clickable-icon bases-toolbar-menu-item-icon";
		rowEl.appendChild(chevronEl);

		const chevronSvgEl = document.createElement("div");
		chevronSvgEl.className = "svg-icon lucide-chevron-right";
		chevronEl.appendChild(chevronSvgEl);

		chevronEl.addEventListener("click", () => {
			if (!openSettingsOnChevron) return;
			const settingsStateMarkerEl = document.createElement("div");
			settingsStateMarkerEl.className = "view-config-menu";
			containerEl.appendChild(settingsStateMarkerEl);
		});
	}

	return menuEl;
}

describe("openNativeViewSettingsAtAnchor", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("opens native view settings via view row chevron and restores toolbar hidden class", async () => {
		const { rootEl, triggerButtonEl, anchorEl } = createRootWithViewsTrigger();
		rootEl.classList.add("tn-bases-native-toolbar-hidden");

		triggerButtonEl.addEventListener("click", () => {
			appendNativeViewListMenu("custom view", {
				withChevron: true,
				openSettingsOnChevron: true,
			});
		});

		const result = await openNativeViewSettingsAtAnchor({
			rootEl,
			viewName: "custom view",
			anchorEl,
			nativeToolbarHiddenClass: "tn-bases-native-toolbar-hidden",
		});

		expect(result).toEqual({ status: "opened-settings" });
		expect(rootEl.classList.contains("tn-bases-native-toolbar-hidden")).toBe(true);
	});

	it("returns opened-view-list-only when target view row is missing", async () => {
		const { rootEl, triggerButtonEl, anchorEl } = createRootWithViewsTrigger();

		triggerButtonEl.addEventListener("click", () => {
			appendNativeViewListMenu("Table", {
				withChevron: true,
				openSettingsOnChevron: true,
			});
		});

		const result = await openNativeViewSettingsAtAnchor({
			rootEl,
			viewName: "Cards",
			anchorEl,
		});

		expect(result.status).toBe("opened-view-list-only");
		expect(result.reason).toBe("view-row-not-found");
	});

	it("returns opened-view-list-only when view row exists but chevron cannot open settings", async () => {
		const { rootEl, triggerButtonEl, anchorEl } = createRootWithViewsTrigger();

		triggerButtonEl.addEventListener("click", () => {
			appendNativeViewListMenu("Table", {
				withChevron: true,
				openSettingsOnChevron: false,
			});
		});

		const result = await openNativeViewSettingsAtAnchor({
			rootEl,
			viewName: "Table",
			anchorEl,
		});

		expect(result.status).toBe("opened-view-list-only");
		expect(result.reason).toBe("view-settings-not-opened");
	});

	it("returns failed when native views trigger is unavailable", async () => {
		const rootEl = document.createElement("div");
		document.body.appendChild(rootEl);
		const anchorEl = document.createElement("button");
		rootEl.appendChild(anchorEl);

		const result = await openNativeViewSettingsAtAnchor({
			rootEl,
			viewName: "Table",
			anchorEl,
		});

		expect(result.status).toBe("failed");
		expect(result.reason).toBe("views-trigger-missing");
	});
});
