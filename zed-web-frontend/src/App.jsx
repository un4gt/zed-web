import './App.css';
import ZedWorkbench from './components/workbench/ZedWorkbench';
import useConnectionForm from './hooks/useConnectionForm';
import useZedIconThemes from './hooks/useZedIconThemes';
import useRemoteWorkspace from './hooks/useRemoteWorkspace';
import useWorkbenchPanels from './hooks/useWorkbenchPanels';
import useZedThemes from './hooks/useZedThemes';

function App() {
  const connectionForm = useConnectionForm();
  const panels = useWorkbenchPanels();
  const iconThemeManager = useZedIconThemes();
  const themeManager = useZedThemes();
  const workspace = useRemoteWorkspace({
    form: connectionForm.form,
    setLeftDockMode: panels.setLeftDockMode,
  });

  return (
    <ZedWorkbench
      connectionForm={connectionForm}
      iconThemeManager={iconThemeManager}
      panels={panels}
      themeManager={themeManager}
      workspace={workspace}
    />
  );
}

export default App;
