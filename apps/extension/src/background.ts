interface ChromeSidePanel {
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
  open(options: { tabId?: number; windowId?: number }): Promise<void>;
}

interface ChromeContextMenus {
  removeAll(callback?: () => void): void;
  create(
    createProperties: {
      id: string;
      title: string;
      contexts: string[];
    },
    callback?: () => void,
  ): void;
  onClicked: {
    addListener(
      callback: (
        info: { menuItemId: string | number; selectionText?: string },
        tab?: { id?: number; windowId?: number },
      ) => void,
    ): void;
  };
}

interface ChromeStorageArea {
  set(items: Record<string, unknown>): Promise<void>;
}

interface ChromeGlobal {
  runtime?: {
    onInstalled?: {
      addListener(callback: () => void): void;
    };
  };
  sidePanel?: ChromeSidePanel;
  contextMenus?: ChromeContextMenus;
  storage?: {
    session?: ChromeStorageArea;
    local?: ChromeStorageArea;
  };
}

const CONTEXT_MENU_ID = 'warroom-stress-test-selection';
const chromeApi = (globalThis as { chrome?: ChromeGlobal }).chrome;

function setupExtensionHooks(): void {
  void chromeApi?.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });
  if (chromeApi?.contextMenus) {
    chromeApi.contextMenus.removeAll(() => {
      chromeApi.contextMenus?.create({
        id: CONTEXT_MENU_ID,
        title: 'Stress-test selection in War Room',
        contexts: ['selection'],
      });
    });
  }
}

chromeApi?.runtime?.onInstalled?.addListener(() => {
  setupExtensionHooks();
});

chromeApi?.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  const trimmed = info.selectionText?.trim();
  if (trimmed) {
    const payload = {
      initialBrief: trimmed,
      initialBriefTs: Date.now(),
    };
    if (chromeApi.storage?.session) {
      void chromeApi.storage.session.set(payload);
    } else if (chromeApi.storage?.local) {
      void chromeApi.storage.local.set(payload);
    }
  }
  if (tab?.id !== undefined) {
    void chromeApi.sidePanel?.open({ tabId: tab.id });
  } else if (tab?.windowId !== undefined) {
    void chromeApi.sidePanel?.open({ windowId: tab.windowId });
  }
});

export const EXTENSION_READY = true;
