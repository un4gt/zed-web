import { CENTER_PANEL_TITLES } from '../../constants/panels';
import Icon from '../icons/Icon';
import IconButton from '../ui/IconButton';

const UTILITY_PANEL_CONFIG = {
  about: {
    icon: 'zed',
    title: 'About zew',
    heading: 'zew',
    body: 'A browser workspace for connecting to the gateway and editing remote files.',
  },
  settings: {
    icon: 'settings',
    title: 'Settings',
    heading: 'Settings',
    body: 'User settings will be edited from this workspace surface.',
  },
  'settings-file': {
    icon: 'file',
    title: 'Settings File',
    heading: 'settings.json',
    body: 'Settings file editing will open here once the remote configuration path is available.',
  },
  theme: {
    icon: 'sparkles',
    title: 'Theme Selector',
    heading: 'Select Theme',
    body: 'Zed One Dark is active for this preview build.',
  },
  'icon-theme': {
    icon: 'files',
    title: 'Icon Theme Selector',
    heading: 'Select Icon Theme',
    body: 'Zed default file icons are active for the project tree and editor tabs.',
  },
  extensions: {
    icon: 'plus',
    title: 'Extensions',
    heading: 'Extensions',
    body: 'Extension discovery will be connected after the remote server capability is available.',
  },
};

export function UtilityPanel({ mode, onClose }) {
  const config = UTILITY_PANEL_CONFIG[mode] ?? UTILITY_PANEL_CONFIG.about;

  return (
    <section className="workspace-placeholder workspace-utility" aria-label={config.title}>
      <div className="workspace-placeholder-toolbar">
        <button aria-label="Back" className="zed-tool-button" type="button">
          <Icon name="arrow-left" />
        </button>
        <button aria-label="Forward" className="zed-tool-button" type="button">
          <Icon name="arrow-right" />
        </button>
        <div className="workspace-placeholder-title">
          <Icon name={config.icon} />
          <span>{config.title}</span>
        </div>
        <IconButton icon="close" label={`Close ${config.title}`} onClick={onClose} variant="ghost" />
      </div>
      <div className="workspace-empty-state is-centered">
        <h2>{config.heading}</h2>
        <p>{config.body}</p>
      </div>
    </section>
  );
}

export function ProjectSearchPanel({ onClose }) {
  return (
    <section className="workspace-placeholder workspace-search" aria-label={CENTER_PANEL_TITLES.search}>
      <div className="workspace-placeholder-toolbar">
        <button aria-label="Back" className="zed-tool-button" type="button">
          <Icon name="arrow-left" />
        </button>
        <button aria-label="Forward" className="zed-tool-button" type="button">
          <Icon name="arrow-right" />
        </button>
        <div className="workspace-placeholder-title">
          <Icon name="search" />
          <span>Project Search</span>
        </div>
        <IconButton icon="close" label="Close project search" onClick={onClose} variant="ghost" />
      </div>
      <div className="search-input-row">
        <input aria-label="Search all files" placeholder="Search all files..." />
        <button className="zed-text-toggle" type="button">
          Aa
        </button>
        <button className="zed-text-toggle" type="button">
          wd
        </button>
        <button aria-label="Regex" className="zed-tool-button" type="button">
          <Icon name="sparkles" />
        </button>
        <button aria-label="Filter" className="zed-tool-button" type="button">
          <Icon name="filter" />
        </button>
        <span>0/0</span>
      </div>
      <div className="workspace-empty-state">
        <h2>Search All Files</h2>
        <p>Hit enter to search. For more options:</p>
        <ul>
          <li>Include/exclude specific paths</li>
          <li>Find and replace</li>
          <li>Match with regex</li>
          <li>Match case</li>
          <li>Match whole words</li>
        </ul>
      </div>
    </section>
  );
}

export function ProjectDiagnosticsPanel({ onClose }) {
  return (
    <section className="workspace-placeholder workspace-diagnostics" aria-label={CENTER_PANEL_TITLES.diagnostics}>
      <div className="workspace-placeholder-toolbar">
        <button aria-label="Back" className="zed-tool-button" type="button">
          <Icon name="arrow-left" />
        </button>
        <button aria-label="Forward" className="zed-tool-button" type="button">
          <Icon name="arrow-right" />
        </button>
        <div className="workspace-placeholder-title is-ok">
          <Icon name="check" />
          <span>No problems</span>
        </div>
        <IconButton icon="close" label="Close project diagnostics" onClick={onClose} variant="ghost" />
      </div>
      <div className="workspace-toolbar-right">
        <Icon name="search" />
        <Icon name="sparkles" />
        <Icon name="refresh" />
        <Icon name="warning" />
      </div>
      <div className="workspace-empty-state is-centered">
        <p>No problems in workspace</p>
      </div>
    </section>
  );
}

export function TasksPanel({ onClose }) {
  return (
    <section className="workspace-placeholder workspace-tasks" aria-label={CENTER_PANEL_TITLES.tasks}>
      <div className="workspace-placeholder-toolbar">
        <button aria-label="Back" className="zed-tool-button" type="button">
          <Icon name="arrow-left" />
        </button>
        <button aria-label="Forward" className="zed-tool-button" type="button">
          <Icon name="arrow-right" />
        </button>
        <div className="workspace-placeholder-title">
          <Icon name="bolt" />
          <span>Tasks</span>
        </div>
        <IconButton icon="close" label="Close tasks" onClick={onClose} variant="ghost" />
      </div>
      <div className="workspace-toolbar-right">
        <Icon name="plus" />
        <Icon name="refresh" />
      </div>
      <div className="workspace-empty-state is-centered">
        <h2>No tasks configured</h2>
        <p>Task discovery and launch controls will appear here.</p>
      </div>
    </section>
  );
}
