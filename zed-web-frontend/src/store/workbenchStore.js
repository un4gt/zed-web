
import { create } from 'zustand';
import { DEFAULT_GATEWAY_URL } from '../lib/config';

export const useWorkbenchStore = create((set) => ({
  gatewayUrl: DEFAULT_GATEWAY_URL,
  session: null,
  connectionState: 'idle',
  tree: [],
  activePath: '',
  tabs: [],
  bufferMeta: {},
  terminalStatus: 'idle',
  statusMessages: ['Ready. Open a remote project to begin.'],
  setGatewayUrl: (gatewayUrl) => set({ gatewayUrl }),
  appendStatus: (message) =>
    set((state) => ({
      statusMessages: [...state.statusMessages.slice(-5), message],
    })),
  setSession: (session) => set({ session, connectionState: session.state }),
  setTree: (tree) => set({ tree }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setActivePath: (activePath) => set({ activePath }),
  upsertTab: (path) =>
    set((state) => ({
      tabs: state.tabs.includes(path) ? state.tabs : [...state.tabs, path],
      activePath: path,
    })),
  closeTab: (path) =>
    set((state) => {
      const tabs = state.tabs.filter((item) => item !== path);
      const nextActivePath = state.activePath === path ? tabs[tabs.length - 1] ?? '' : state.activePath;
      return { tabs, activePath: nextActivePath };
    }),
  setBufferMeta: (path, meta) =>
    set((state) => ({
      bufferMeta: {
        ...state.bufferMeta,
        [path]: { ...state.bufferMeta[path], ...meta, path },
      },
    })),
  setBufferDirty: (path, dirty) =>
    set((state) => {
      const currentMeta = state.bufferMeta[path];
      if (currentMeta?.dirty === dirty) {
        return state;
      }

      return {
        bufferMeta: {
          ...state.bufferMeta,
          [path]: { ...currentMeta, path, dirty },
        },
      };
    }),
  setTerminalStatus: (terminalStatus) => set({ terminalStatus }),
}));
