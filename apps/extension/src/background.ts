interface ChromeSidePanel {
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
  open(options: { tabId?: number; windowId?: number }): Promise<void>;
}

interface ChromeContextMenus {
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

interface ChromeGlobal {
  runtime?: {
    onInstalled?: {
      addListener(callback: () => void): void;
    };
  };
  sidePanel?: ChromeSidePanel;
  contextMenus?: ChromeContextMenus;
  storage?: {
    session?: {
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
}

const CONTEXT_MENU_ID = 'warroom-stress-test-selection';
const chromeApi = (globalThis as { chrome?: ChromeGlobal }).chrome;

chromeApi?.runtime?.onInstalled?.addListener(() => {
  void chromeApi.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });
  chromeApi.contextMenus?.create({
    id: CONTEXT_MENU_ID,
    title: 'Stress-test selection in War Room',
    contexts: ['selection'],
  });
});

chromeApi?.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  if (info.selectionText) {
    void chromeApi.storage?.session?.set({
      initialBrief: info.selectionText,
    });
  }
  if (tab?.id !== undefined) {
    void chromeApi.sidePanel?.open({ tabId: tab.id });
  }
});

export const EXTENSION_READY = true;
