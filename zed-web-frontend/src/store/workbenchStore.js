
import { create } from 'zustand';
import { DEFAULT_GATEWAY_URL } from '../lib/config';

export const useWorkbenchStore = create((set) => ({
  gatewayUrl: DEFAULT_GATEWAY_URL,
  session: null,
  connectionState: 'idle',
  tree: [],
  treeLoadedPaths: [],
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
  setTree: (tree, treeLoadedPaths = []) => set({ tree, treeLoadedPaths }),
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
  setBufferDirty: (path, dirty, patch = {}) =>
    set((state) => {
      const currentMeta = state.bufferMeta[path];
      if (currentMeta?.dirty === dirty && Object.keys(patch).length === 0) {
        return state;
      }

      return {
        bufferMeta: {
          ...state.bufferMeta,
          [path]: { ...currentMeta, path, ...patch, dirty },
        },
      };
    }),
  updateBufferMeta: (path, patch) =>
    set((state) => ({
      bufferMeta: {
        ...state.bufferMeta,
        [path]: { ...state.bufferMeta[path], path, ...patch },
      },
    })),
  setTerminalStatus: (terminalStatus) => set({ terminalStatus }),
}));
