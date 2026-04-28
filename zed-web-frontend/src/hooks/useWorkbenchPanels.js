import { useCallback, useEffect, useRef, useState } from 'react';
import usePanelResize from './usePanelResize';

const DEFAULT_PANEL_LAYOUT = {
  projectWidth: 268,
  inspectorWidth: 286,
  terminalHeight: 236,
};

function useWorkbenchPanels() {
  const [leftDockMode, setLeftDockMode] = useState(null);
  const [centerPanelMode, setCenterPanelMode] = useState(null);
  const [bottomPanelMode, setBottomPanelMode] = useState(null);
  const [rightDockMode, setRightDockMode] = useState(null);
  const [terminalSessionStarted, setTerminalSessionStarted] = useState(false);
  const [terminalInstanceKey, setTerminalInstanceKey] = useState(0);
  const [panelLayout, setPanelLayout] = useState(() => DEFAULT_PANEL_LAYOUT);
  const panelLayoutRef = useRef(panelLayout);
  const startPanelResize = usePanelResize(panelLayoutRef, setPanelLayout);

  useEffect(() => {
    panelLayoutRef.current = panelLayout;
  }, [panelLayout]);

  const toggleLeftDock = useCallback((mode) => {
    setLeftDockMode((currentMode) => (currentMode === mode ? null : mode));
  }, []);

  const toggleCenterPanel = useCallback((mode) => {
    setCenterPanelMode((currentMode) => (currentMode === mode ? null : mode));
  }, []);

  const toggleBottomPanel = useCallback((mode) => {
    if (mode === 'terminal') {
      setTerminalSessionStarted(true);
    }

    setBottomPanelMode((currentMode) => (currentMode === mode ? null : mode));
  }, []);

  const toggleRightDock = useCallback((mode) => {
    setRightDockMode((currentMode) => (currentMode === mode ? null : mode));
  }, []);

  const openRemotePanel = useCallback(() => {
    setRightDockMode('remote');
  }, []);

  const startNewTerminal = useCallback(() => {
    setTerminalSessionStarted(true);
    setBottomPanelMode('terminal');
    setTerminalInstanceKey((currentKey) => currentKey + 1);
  }, []);

  return {
    leftDockMode,
    centerPanelMode,
    bottomPanelMode,
    rightDockMode,
    terminalSessionStarted,
    terminalInstanceKey,
    panelLayout,
    startPanelResize,
    setLeftDockMode,
    setCenterPanelMode,
    setBottomPanelMode,
    setRightDockMode,
    toggleLeftDock,
    toggleCenterPanel,
    toggleBottomPanel,
    toggleRightDock,
    openRemotePanel,
    startNewTerminal,
  };
}

export default useWorkbenchPanels;
