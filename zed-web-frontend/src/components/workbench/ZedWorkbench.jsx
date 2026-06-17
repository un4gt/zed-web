import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import CommandPalette from '../command/CommandPalette';
import BottomPanel from '../panels/BottomPanel';
import { ProjectDiagnosticsPanel, ProjectSearchPanel, TasksPanel, UtilityPanel } from '../panels/CenterPanels';
import EditorPlaceholder from '../editor/EditorPlaceholder';
import LeftDock from '../panels/LeftDock';
import ResizeHandle from '../ui/ResizeHandle';
import RightDock from '../panels/RightDock';
import TabStrip from '../editor/TabStrip';
import IconThemeSelectorPanel from '../themes/IconThemeSelectorPanel';
import ThemeSelectorPanel from '../themes/ThemeSelectorPanel';
import TitleBar from '../shell/TitleBar';
import ZedBottomBar from '../shell/ZedBottomBar';
import { createWorkbenchCommandRegistry } from '../../commands/workbenchCommandRegistry';
import { resolveAppMenus } from '../../constants/appMenus';
import useWorkbenchKeybindings from '../../hooks/useWorkbenchKeybindings';
import { loadMonaco } from '../../lib/monacoLoader';

const loadEditorPane = () => import('../editor/EditorPane');
const EditorPane = lazy(loadEditorPane);

function ZedWorkbench({ connectionForm, iconThemeManager, panels, themeManager, workspace }) {
  const { form, updateFormField } = connectionForm;
  const {
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
  } = panels;
  const {
    activeMeta,
    activePath,
    bufferMeta,
    closeTab,
    connectionState,
    gatewayUrl,
    isOpeningSession,
    loadTree,
    openFile,
    openSession,
    reconnect,
    revertActiveFile,
    saveActiveFile,
    session,
    setActivePath,
    setBufferDirty,
    setGatewayUrl,
    setTerminalStatus,
    showTabStrip,
    statusMessages,
    tabs,
    terminalStatus,
    tree,
    treeLoadedPaths,
    appendStatus,
  } = workspace;
  const isSelectorPanelMode = centerPanelMode === 'theme' || centerPanelMode === 'icon-theme';
  const isCenterUtilityMode = Boolean(centerPanelMode && !isSelectorPanelMode);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const commandRegistry = useMemo(() => createWorkbenchCommandRegistry(), []);
  const capabilities = useMemo(() => createCapabilitySet(session), [session]);
  const commandContext = useMemo(
    () => ({
      activePath,
      bottomPanelMode,
      capabilities,
      commandPaletteOpen,
      hasActiveFile: Boolean(activeMeta),
      hasSession: Boolean(session),
      leftDockMode,
      rightDockMode,
      selectorOpen: isSelectorPanelMode,
      suppressKeybindings: commandPaletteOpen || isSelectorPanelMode,
      notify: appendStatus,
      openExternalUrl,
      panels: {
        toggleBottomPanel,
        toggleLeftDock,
        toggleRightDock,
      },
      server: {
        dispatch: (zedAction, command) => {
          appendStatus(`${command.title} requires zed-server command dispatch (${zedAction}).`);
        },
      },
      ui: {
        setBottomPanelMode,
        setCenterPanelMode,
        setCommandPaletteOpen,
        setLeftDockMode,
        setRightDockMode,
      },
      workspace: {
        activePath,
        closeTab,
        openRemotePanel,
        revertActiveFile,
        saveActiveFile,
      },
    }),
    [
      activeMeta,
      activePath,
      appendStatus,
      bottomPanelMode,
      capabilities,
      closeTab,
      commandPaletteOpen,
      isSelectorPanelMode,
      leftDockMode,
      openRemotePanel,
      rightDockMode,
      revertActiveFile,
      saveActiveFile,
      session,
      setBottomPanelMode,
      setCenterPanelMode,
      setLeftDockMode,
      setRightDockMode,
      toggleBottomPanel,
      toggleLeftDock,
      toggleRightDock,
    ],
  );
  const closeSelectorPanel = () => {
    if (centerPanelMode === 'theme') {
      themeManager.cancelPreview();
    }

    if (centerPanelMode === 'icon-theme') {
      iconThemeManager.cancelPreview();
    }

    setCenterPanelMode(null);
  };
  const appMenus = useMemo(
    () => resolveAppMenus(commandRegistry, commandContext),
    [commandContext, commandRegistry],
  );
  const commands = useMemo(
    () => commandRegistry.getVisibleCommands(commandContext),
    [commandContext, commandRegistry],
  );
  const keybindings = useMemo(
    () => commandRegistry.getKeybindings(),
    [commandRegistry],
  );
  const executeCommandById = useCallback(
    (commandId, options = {}) => {
      const executed = commandRegistry.executeCommand(commandId, commandContext, options);

      if (!executed) {
        return false;
      }

      if (options.source === 'palette') {
        setCommandPaletteOpen(false);
      }

      return true;
    },
    [commandContext, commandRegistry],
  );
  const openKeybindingChange = useCallback(() => {
    executeCommandById('zed.openKeymap', { source: 'palette' });
  }, [executeCommandById]);

  useWorkbenchKeybindings({
    bindings: keybindings,
    context: commandContext,
    onCommand: executeCommandById,
  });
  useEffect(scheduleEditorRuntimePreload, []);

  return (
    <div className="zed-shell">
      <a className="skip-link" href="#workspace-editor">
        Skip to editor
      </a>

      <main className="workbench" aria-label="zew workbench">
        <TitleBar
          activeMeta={activeMeta}
          connectionState={connectionState}
          iconTheme={iconThemeManager.displayedIconTheme}
          menus={appMenus}
          onRefreshTree={() => loadTree()}
          onRevertActiveFile={revertActiveFile}
          onSaveActiveFile={saveActiveFile}
          session={session}
        />

        <div
          className={`workspace-grid ${leftDockMode ? 'has-left-dock' : ''} ${
            rightDockMode ? 'has-right-dock' : ''
          }`}
          style={{
            '--dock-width': `${panelLayout.projectWidth}px`,
            '--rail-width': `${panelLayout.inspectorWidth}px`,
          }}
        >
          {leftDockMode ? (
            <>
              <LeftDock
                connectionState={connectionState}
                entries={tree}
                form={form}
                gatewayUrl={gatewayUrl}
                iconTheme={iconThemeManager.displayedIconTheme}
                isOpeningSession={isOpeningSession}
                mode={leftDockMode}
                onClose={() => setLeftDockMode(null)}
                onFormFieldChange={updateFormField}
                onGatewayUrlChange={setGatewayUrl}
                onLoadTree={loadTree}
                onOpenFile={openFile}
                onOpenSession={openSession}
                onReconnect={reconnect}
                session={session}
                treeLoadedPaths={treeLoadedPaths}
              />
              <ResizeHandle
                direction="vertical"
                label="Resize left dock"
                onPointerDown={(event) => startPanelResize('project', event)}
              />
            </>
          ) : null}

          <section
            className={`editor-stack ${showTabStrip && !isCenterUtilityMode ? 'has-tabs' : ''} ${
              bottomPanelMode ? 'has-bottom-panel' : ''
            }`}
            aria-label="Editor workspace"
            style={{ '--terminal-height': `${panelLayout.terminalHeight}px` }}
          >
            {showTabStrip && !isCenterUtilityMode ? (
              <TabStrip
                activePath={activePath}
                bufferMeta={bufferMeta}
                iconTheme={iconThemeManager.displayedIconTheme}
                onCloseTab={closeTab}
                onSelectTab={setActivePath}
                tabs={tabs}
              />
            ) : null}

            <div className="editor-surface" id="workspace-editor">
              {centerPanelMode === 'search' ? (
                <ProjectSearchPanel onClose={() => setCenterPanelMode(null)} />
              ) : centerPanelMode === 'tasks' ? (
                <TasksPanel onClose={() => setCenterPanelMode(null)} />
              ) : centerPanelMode === 'diagnostics' ? (
                <ProjectDiagnosticsPanel onClose={() => setCenterPanelMode(null)} />
              ) : isCenterUtilityMode ? (
                <UtilityPanel mode={centerPanelMode} onClose={() => setCenterPanelMode(null)} />
              ) : activeMeta ? (
                <Suspense fallback={<div className="editor-loading">Loading editor</div>}>
                  <EditorPane
                    activeTheme={themeManager.displayedTheme}
                    capabilities={capabilities}
                    gatewayUrl={gatewayUrl}
                    key={activeMeta.path}
                    language={activeMeta.language}
                    loading={activeMeta.loading}
                    onDirtyChange={setBufferDirty}
                    partial={activeMeta.partial}
                    path={activeMeta.path}
                    readOnly={activeMeta.readOnly || activeMeta.truncated}
                    session={session}
                  />
                </Suspense>
              ) : (
                <EditorPlaceholder
                  form={form}
                  gatewayUrl={gatewayUrl}
                  isOpeningSession={isOpeningSession}
                  onFormFieldChange={updateFormField}
                  onGatewayUrlChange={setGatewayUrl}
                  onOpenSession={openSession}
                  onReconnect={reconnect}
                  session={session}
                />
              )}
            </div>

            {bottomPanelMode ? (
              <ResizeHandle
                direction="horizontal"
                label="Resize bottom panel"
                onPointerDown={(event) => startPanelResize('terminal', event)}
              />
            ) : null}
            {terminalSessionStarted ? (
              <BottomPanel
                key="terminal-panel"
                activeTheme={themeManager.displayedTheme}
                hidden={bottomPanelMode !== 'terminal'}
                mode="terminal"
                gatewayUrl={gatewayUrl}
                onClose={() => setBottomPanelMode(null)}
                onLog={appendStatus}
                onNewTerminal={startNewTerminal}
                onStatusChange={setTerminalStatus}
                session={session}
                terminalInstanceKey={terminalInstanceKey}
                terminalStatus={terminalStatus}
              />
            ) : null}
            {bottomPanelMode === 'debug' ? (
              <BottomPanel
                key="debug-panel"
                activeTheme={themeManager.displayedTheme}
                mode="debug"
                gatewayUrl={gatewayUrl}
                onClose={() => setBottomPanelMode(null)}
                onLog={appendStatus}
                onNewTerminal={startNewTerminal}
                onStatusChange={setTerminalStatus}
                session={session}
                terminalInstanceKey={terminalInstanceKey}
                terminalStatus={terminalStatus}
              />
            ) : null}
          </section>

          {rightDockMode ? (
            <>
              <ResizeHandle
                direction="vertical"
                label="Resize right dock"
                onPointerDown={(event) => startPanelResize('inspector', event)}
              />
              <RightDock
                activeMeta={activeMeta}
                connectionState={connectionState}
                form={form}
                gatewayUrl={gatewayUrl}
                isOpeningSession={isOpeningSession}
                mode={rightDockMode}
                onClose={() => setRightDockMode(null)}
                onFormFieldChange={updateFormField}
                onGatewayUrlChange={setGatewayUrl}
                onOpenSession={openSession}
                onReconnect={reconnect}
                session={session}
                statusMessages={statusMessages}
              />
            </>
          ) : null}
        </div>

        <ZedBottomBar
          activeMeta={activeMeta}
          bottomPanelMode={bottomPanelMode}
          centerPanelMode={centerPanelMode}
          connectionState={connectionState}
          leftDockMode={leftDockMode}
          onOpenRemote={openRemotePanel}
          onRefreshTree={() => loadTree()}
          onRevertActiveFile={revertActiveFile}
          onSaveActiveFile={saveActiveFile}
          onToggleBottomPanel={toggleBottomPanel}
          onToggleCenterPanel={toggleCenterPanel}
          onToggleLeftDock={toggleLeftDock}
          onToggleRightDock={toggleRightDock}
          rightDockMode={rightDockMode}
          session={session}
          terminalStatus={terminalStatus}
        />

        {isSelectorPanelMode ? (
          <div
            aria-label={centerPanelMode === 'theme' ? 'Select Theme' : 'Select Icon Theme'}
            aria-modal="true"
            className="zed-picker-layer"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeSelectorPanel();
              }
            }}
            role="dialog"
          >
            {centerPanelMode === 'theme' ? (
              <ThemeSelectorPanel onClose={() => setCenterPanelMode(null)} themeManager={themeManager} />
            ) : (
              <IconThemeSelectorPanel iconThemeManager={iconThemeManager} onClose={() => setCenterPanelMode(null)} />
            )}
          </div>
        ) : null}

        {commandPaletteOpen ? (
          <CommandPalette
            commands={commands}
            onClose={() => setCommandPaletteOpen(false)}
            onRequestKeybindingChange={openKeybindingChange}
            onRunCommand={(commandId) => executeCommandById(commandId, { source: 'palette' })}
          />
        ) : null}
      </main>
    </div>
  );
}

function openExternalUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function createCapabilitySet(session) {
  const capabilities = session?.capabilities;

  if (Array.isArray(capabilities)) {
    return new Set(capabilities);
  }

  if (capabilities && typeof capabilities === 'object') {
    return new Set(
      Object.entries(capabilities)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([capability]) => capability),
    );
  }

  return new Set();
}

function scheduleEditorRuntimePreload() {
  let idleHandle = null;
  let timeoutHandle = null;
  let disposed = false;

  function preloadWhenIdle() {
    if (disposed) {
      return;
    }

    if ('requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(preloadEditorRuntime, { timeout: 2500 });
      return;
    }

    timeoutHandle = window.setTimeout(preloadEditorRuntime, 600);
  }

  if (document.readyState === 'complete') {
    preloadWhenIdle();
  } else {
    window.addEventListener('load', preloadWhenIdle, { once: true });
  }

  return () => {
    disposed = true;
    window.removeEventListener('load', preloadWhenIdle);

    if (idleHandle !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(idleHandle);
    }

    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  };
}

function preloadEditorRuntime() {
  void Promise.allSettled([loadEditorPane(), loadMonaco()]);
}

export default ZedWorkbench;
