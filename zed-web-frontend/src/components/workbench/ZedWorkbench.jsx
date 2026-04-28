import { useMemo } from 'react';
import BottomPanel from '../panels/BottomPanel';
import { ProjectDiagnosticsPanel, ProjectSearchPanel, TasksPanel, UtilityPanel } from '../panels/CenterPanels';
import EditorPane from '../editor/EditorPane';
import EditorPlaceholder from '../editor/EditorPlaceholder';
import LeftDock from '../panels/LeftDock';
import ResizeHandle from '../ui/ResizeHandle';
import RightDock from '../panels/RightDock';
import TabStrip from '../editor/TabStrip';
import IconThemeSelectorPanel from '../themes/IconThemeSelectorPanel';
import ThemeSelectorPanel from '../themes/ThemeSelectorPanel';
import TitleBar from '../shell/TitleBar';
import ZedBottomBar from '../shell/ZedBottomBar';
import { resolveAppMenus } from '../../constants/appMenus';

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
    appendStatus,
  } = workspace;
  const isSelectorPanelMode = centerPanelMode === 'theme' || centerPanelMode === 'icon-theme';
  const isCenterUtilityMode = Boolean(centerPanelMode && !isSelectorPanelMode);
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
    () =>
      resolveAppMenus(
        {
          about: () => setCenterPanelMode('about'),
          checkRemoteServerUpdates: () => appendStatus('remote-zed-server update check is not connected yet.'),
          checkUiUpdates: () => appendStatus('UI update check is not connected yet. Rebuild the Docker image to deploy the latest UI.'),
          closeEditor: () => {
            if (activePath) {
              closeTab(activePath);
            }
          },
          collabPanel: () => setLeftDockMode('threads'),
          debuggerPanel: () => toggleBottomPanel('debug'),
          diagnostics: () => setCenterPanelMode('diagnostics'),
          documentation: () => openExternalUrl('https://zed.dev/docs'),
          emailZed: () => openExternalUrl('mailto:hello@zed.dev'),
          extensions: () => setCenterPanelMode('extensions'),
          fileBugReport: () => openExternalUrl('https://github.com/zed-industries/zed/issues/new/choose'),
          find: () => setCenterPanelMode('search'),
          findInProject: () => setCenterPanelMode('search'),
          joinTheTeam: () => openExternalUrl('https://zed.dev/jobs'),
          openRecent: () => setLeftDockMode('recent'),
          openRemote: openRemotePanel,
          openSettings: () => setCenterPanelMode('settings'),
          openSettingsFile: () => setCenterPanelMode('settings-file'),
          outlinePanel: () => setLeftDockMode('outline'),
          projectPanel: () => setLeftDockMode('project'),
          requestFeature: () => openExternalUrl('https://github.com/zed-industries/zed/discussions/categories/feature-requests'),
          save: saveActiveFile,
          selectIconTheme: () => setCenterPanelMode('icon-theme'),
          selectTheme: () => setCenterPanelMode('theme'),
          tasksPanel: () => setCenterPanelMode('tasks'),
          terminalPanel: () => toggleBottomPanel('terminal'),
          toggleAllDocks: () => {
            if (leftDockMode || rightDockMode || bottomPanelMode) {
              setLeftDockMode(null);
              setRightDockMode(null);
              setBottomPanelMode(null);
            } else {
              setLeftDockMode('project');
              setRightDockMode('inspector');
              toggleBottomPanel('terminal');
            }
          },
          toggleBottomDock: () => toggleBottomPanel('terminal'),
          toggleLeftDock: () => toggleLeftDock(leftDockMode ?? 'project'),
          toggleRightDock: () => toggleRightDock(rightDockMode ?? 'inspector'),
          zedRepository: () => openExternalUrl('https://github.com/zed-industries/zed'),
          zedTwitter: () => openExternalUrl('https://twitter.com/zeddotdev'),
        },
        {
          hasActiveFile: Boolean(activeMeta),
          hasSession: Boolean(session),
        },
      ),
    [
      activeMeta,
      activePath,
      appendStatus,
      bottomPanelMode,
      closeTab,
      leftDockMode,
      openRemotePanel,
      rightDockMode,
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
                <EditorPane
                  activeTheme={themeManager.displayedTheme}
                  key={activeMeta.path}
                  language={activeMeta.language}
                  onDirtyChange={setBufferDirty}
                  path={activeMeta.path}
                />
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
      </main>
    </div>
  );
}

function openExternalUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default ZedWorkbench;
