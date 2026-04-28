export const ICON_ROOT = '/icons/file_icons';
export const DEFAULT_ICON_THEME_NAME = 'Zed (Default)';

export const FILE_STEMS_BY_ICON_KEY = {
  docker: ['Containerfile', 'Dockerfile'],
  heroku: ['Procfile'],
  ruby: ['Podfile'],
};

export const FILE_SUFFIXES_BY_ICON_KEY = {
  astro: ['astro'],
  audio: ['aac', 'flac', 'm4a', 'mka', 'mp3', 'ogg', 'opus', 'wav', 'wma', 'wv'],
  backup: ['bak'],
  bicep: ['bicep'],
  bun: ['lockb'],
  c: ['c', 'h'],
  cairo: ['cairo'],
  code: ['handlebars', 'metadata', 'rkt', 'scm'],
  coffeescript: ['coffee'],
  cpp: ['c++', 'h++', 'cc', 'cpp', 'cppm', 'cxx', 'hh', 'hpp', 'hxx', 'inl', 'ixx'],
  crystal: ['cr', 'ecr'],
  csharp: ['cs'],
  csproj: ['csproj'],
  css: ['css', 'pcss', 'postcss'],
  cue: ['cue'],
  dart: ['dart'],
  diff: ['diff'],
  docker: ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'],
  document: ['doc', 'docx', 'mdx', 'odp', 'ods', 'odt', 'pdf', 'ppt', 'pptx', 'rtf', 'txt', 'xls', 'xlsx'],
  editorconfig: ['editorconfig'],
  elixir: ['eex', 'ex', 'exs', 'heex', 'leex', 'neex'],
  elm: ['elm'],
  erlang: ['Emakefile', 'app.src', 'erl', 'escript', 'hrl', 'rebar.config', 'xrl', 'yrl'],
  eslint: [
    'eslint.config.cjs',
    'eslint.config.cts',
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.mts',
    'eslint.config.ts',
    'eslintrc',
    'eslintrc.js',
    'eslintrc.json',
  ],
  font: ['otf', 'ttf', 'woff', 'woff2'],
  fsharp: ['fs'],
  fsproj: ['fsproj'],
  gitlab: ['gitlab-ci.yml', 'gitlab-ci.yaml'],
  gleam: ['gleam'],
  go: ['go', 'mod', 'work'],
  graphql: ['gql', 'graphql', 'graphqls'],
  haskell: ['hs'],
  hcl: ['hcl'],
  helm: [
    'helmfile.yaml',
    'helmfile.yml',
    'Chart.yaml',
    'Chart.yml',
    'Chart.lock',
    'values.yaml',
    'values.yml',
    'requirements.yaml',
    'requirements.yml',
    'tpl',
  ],
  html: ['htm', 'html'],
  image: ['avif', 'bmp', 'gif', 'heic', 'heif', 'ico', 'j2k', 'jfif', 'jp2', 'jpeg', 'jpg', 'jxl', 'png', 'psd', 'qoi', 'svg', 'tiff', 'webp'],
  ipynb: ['ipynb'],
  java: ['java'],
  javascript: ['cjs', 'js', 'mjs'],
  json: ['json', 'jsonc'],
  julia: ['jl'],
  kdl: ['kdl'],
  kotlin: ['kt'],
  lock: ['lock'],
  log: ['log'],
  lua: ['lua'],
  luau: ['luau'],
  markdown: ['markdown', 'md'],
  metal: ['metal'],
  nim: ['nim', 'nims', 'nimble'],
  nix: ['nix'],
  ocaml: ['ml', 'mli', 'mlx'],
  odin: ['odin'],
  php: ['php'],
  prettier: [
    'prettier.config.cjs',
    'prettier.config.js',
    'prettier.config.mjs',
    'prettierignore',
    'prettierrc',
    'prettierrc.cjs',
    'prettierrc.js',
    'prettierrc.json',
    'prettierrc.json5',
    'prettierrc.mjs',
    'prettierrc.toml',
    'prettierrc.yaml',
    'prettierrc.yml',
  ],
  prisma: ['prisma'],
  puppet: ['pp'],
  python: ['py'],
  r: ['r', 'R'],
  react: ['cjsx', 'ctsx', 'jsx', 'mjsx', 'mtsx', 'tsx'],
  roc: ['roc'],
  ruby: ['rb'],
  rust: ['rs'],
  sass: ['sass', 'scss'],
  scala: ['scala', 'sc'],
  settings: ['conf', 'ini'],
  solidity: ['sol'],
  storage: [
    'accdb',
    'csv',
    'dat',
    'db',
    'dbf',
    'dll',
    'fmp',
    'fp7',
    'frm',
    'gdb',
    'ib',
    'ldf',
    'mdb',
    'mdf',
    'myd',
    'myi',
    'pdb',
    'RData',
    'rdata',
    'sav',
    'sdf',
    'sql',
    'sqlite',
    'tsv',
  ],
  stylelint: [
    'stylelint.config.cjs',
    'stylelint.config.js',
    'stylelint.config.mjs',
    'stylelintignore',
    'stylelintrc',
    'stylelintrc.cjs',
    'stylelintrc.js',
    'stylelintrc.json',
    'stylelintrc.mjs',
    'stylelintrc.yaml',
    'stylelintrc.yml',
  ],
  surrealql: ['surql'],
  svelte: ['svelte'],
  swift: ['swift'],
  tcl: ['tcl'],
  template: ['hbs', 'plist', 'xml'],
  terminal: [
    'bash',
    'bash_aliases',
    'bash_login',
    'bash_logout',
    'bash_profile',
    'bashrc',
    'fish',
    'nu',
    'profile',
    'ps1',
    'sh',
    'zlogin',
    'zlogout',
    'zprofile',
    'zsh',
    'zsh_aliases',
    'zsh_histfile',
    'zsh_history',
    'zshenv',
    'zshrc',
  ],
  terraform: ['tf', 'tfvars'],
  toml: ['toml'],
  typescript: ['cts', 'mts', 'ts'],
  v: ['v', 'vsh', 'vv'],
  vbproj: ['vbproj'],
  vcs: ['COMMIT_EDITMSG', 'EDIT_DESCRIPTION', 'MERGE_MSG', 'NOTES_EDITMSG', 'TAG_EDITMSG', 'gitattributes', 'gitignore', 'gitkeep', 'gitmodules'],
  video: ['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm', 'wmv'],
  vs_sln: ['sln'],
  vs_suo: ['suo'],
  vue: ['vue'],
  vyper: ['vy', 'vyi'],
  wgsl: ['wgsl'],
  yaml: ['yaml', 'yml'],
  zig: ['zig'],
};

export const FILE_ICON_PATH_BY_KEY = {
  astro: 'astro.svg',
  audio: 'audio.svg',
  bicep: 'file.svg',
  bun: 'bun.svg',
  c: 'c.svg',
  cairo: 'cairo.svg',
  code: 'code.svg',
  coffeescript: 'coffeescript.svg',
  cpp: 'cpp.svg',
  crystal: 'file.svg',
  csharp: 'file.svg',
  csproj: 'file.svg',
  css: 'css.svg',
  cue: 'file.svg',
  dart: 'dart.svg',
  default: 'file.svg',
  diff: 'diff.svg',
  docker: 'docker.svg',
  document: 'book.svg',
  editorconfig: 'editorconfig.svg',
  elixir: 'elixir.svg',
  elm: 'elm.svg',
  erlang: 'erlang.svg',
  eslint: 'eslint.svg',
  font: 'font.svg',
  fsharp: 'fsharp.svg',
  fsproj: 'file.svg',
  gitlab: 'gitlab.svg',
  gleam: 'gleam.svg',
  go: 'go.svg',
  graphql: 'graphql.svg',
  haskell: 'haskell.svg',
  hcl: 'hcl.svg',
  helm: 'helm.svg',
  heroku: 'heroku.svg',
  html: 'html.svg',
  image: 'image.svg',
  ipynb: 'jupyter.svg',
  java: 'java.svg',
  javascript: 'javascript.svg',
  json: 'code.svg',
  julia: 'julia.svg',
  kdl: 'kdl.svg',
  kotlin: 'kotlin.svg',
  lock: 'lock.svg',
  log: 'info.svg',
  lua: 'lua.svg',
  luau: 'luau.svg',
  markdown: 'book.svg',
  metal: 'metal.svg',
  nim: 'nim.svg',
  nix: 'nix.svg',
  ocaml: 'ocaml.svg',
  odin: 'odin.svg',
  phoenix: 'phoenix.svg',
  php: 'php.svg',
  prettier: 'prettier.svg',
  prisma: 'prisma.svg',
  puppet: 'puppet.svg',
  python: 'python.svg',
  r: 'r.svg',
  react: 'react.svg',
  roc: 'roc.svg',
  ruby: 'ruby.svg',
  rust: 'rust.svg',
  sass: 'sass.svg',
  scala: 'scala.svg',
  settings: 'settings.svg',
  solidity: 'file.svg',
  storage: 'database.svg',
  stylelint: 'javascript.svg',
  surrealql: 'surrealql.svg',
  svelte: 'html.svg',
  swift: 'swift.svg',
  tcl: 'tcl.svg',
  template: 'html.svg',
  terminal: 'terminal.svg',
  terraform: 'terraform.svg',
  toml: 'toml.svg',
  typescript: 'typescript.svg',
  v: 'v.svg',
  vbproj: 'file.svg',
  vcs: 'git.svg',
  video: 'video.svg',
  vs_sln: 'file.svg',
  vs_suo: 'file.svg',
  vue: 'vue.svg',
  vyper: 'vyper.svg',
  wgsl: 'wgsl.svg',
  yaml: 'yaml.svg',
  zig: 'zig.svg',
};

export const FILE_STEMS = associationsByIconKey(FILE_STEMS_BY_ICON_KEY);
export const FILE_SUFFIXES = associationsByIconKey(FILE_SUFFIXES_BY_ICON_KEY);

export const DEFAULT_ICON_THEME = {
  id: 'builtin:zed-default:zed-default:0',
  name: DEFAULT_ICON_THEME_NAME,
  familyName: 'Zed',
  author: 'Zed Industries',
  appearance: 'dark',
  source: 'builtin',
  sourceId: 'builtin:zed-default',
  sourceLabel: 'Built-in',
  sourcePath: '/icons/file_icons',
  directoryIcons: {
    collapsed: `${ICON_ROOT}/folder.svg`,
    expanded: `${ICON_ROOT}/folder_open.svg`,
  },
  namedDirectoryIcons: {},
  chevronIcons: {
    collapsed: `${ICON_ROOT}/chevron_right.svg`,
    expanded: `${ICON_ROOT}/chevron_down.svg`,
  },
  fileStems: FILE_STEMS,
  fileSuffixes: FILE_SUFFIXES,
  fileIcons: Object.fromEntries(
    Object.entries(FILE_ICON_PATH_BY_KEY).map(([key, iconPath]) => [key, { path: `${ICON_ROOT}/${iconPath}` }]),
  ),
};

export function fileIconUrlForPath(path, iconTheme = DEFAULT_ICON_THEME) {
  return iconUrlForKey(fileIconKeyForPath(path, iconTheme), iconTheme);
}

export function folderIconUrl(expanded = false, iconTheme = DEFAULT_ICON_THEME, path = '') {
  const name = baseName(path);
  const namedDirectoryIcons = iconTheme?.namedDirectoryIcons ?? {};
  const namedIcons = namedDirectoryIcons[name] ?? namedDirectoryIcons[name.toLowerCase()];
  const directoryIcons = namedIcons ?? iconTheme?.directoryIcons ?? DEFAULT_ICON_THEME.directoryIcons;

  return iconPathForPair(directoryIcons, DEFAULT_ICON_THEME.directoryIcons, expanded);
}

export function chevronIconUrl(expanded = false, iconTheme = DEFAULT_ICON_THEME) {
  return iconPathForPair(iconTheme?.chevronIcons, DEFAULT_ICON_THEME.chevronIcons, expanded);
}

export function fileIconKeyForPath(path, iconTheme = DEFAULT_ICON_THEME) {
  const name = baseName(path);

  if (name) {
    const matchedName = iconKeyForSuffix(name, iconTheme);
    if (matchedName) {
      return matchedName;
    }

    let suffix = name;
    while (suffix.includes('.')) {
      suffix = suffix.slice(suffix.indexOf('.') + 1);
      const matchedSuffix = iconKeyForSuffix(suffix, iconTheme);
      if (matchedSuffix) {
        return matchedSuffix;
      }
    }

    const hiddenName = name.startsWith('.') ? name.slice(1) : '';
    if (hiddenName) {
      const matchedHiddenName = iconKeyForSuffix(hiddenName, iconTheme);
      if (matchedHiddenName) {
        return matchedHiddenName;
      }
    }
  }

  const extension = extensionForName(name);
  return iconKeyForSuffix(extension, iconTheme) ?? 'default';
}

function iconKeyForSuffix(suffix, iconTheme = DEFAULT_ICON_THEME) {
  if (!suffix) {
    return null;
  }

  return iconTheme?.fileStems?.[suffix] ?? iconTheme?.fileSuffixes?.[suffix] ?? null;
}

function iconUrlForKey(key, iconTheme = DEFAULT_ICON_THEME) {
  return iconDefinitionPath(iconTheme?.fileIcons?.[key]) ?? iconDefinitionPath(DEFAULT_ICON_THEME.fileIcons[key]) ?? DEFAULT_ICON_THEME.fileIcons.default.path;
}

function iconPathForPair(iconPair, fallbackPair, expanded) {
  const state = expanded ? 'expanded' : 'collapsed';
  return iconDefinitionPath(iconPair?.[state]) ?? iconDefinitionPath(fallbackPair?.[state]);
}

function iconDefinitionPath(iconDefinition) {
  if (typeof iconDefinition === 'string') {
    return iconDefinition;
  }

  return iconDefinition?.path ?? null;
}

function baseName(path) {
  const normalized = String(path ?? '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

function extensionForName(name) {
  if (!name || name.endsWith('.')) {
    return '';
  }

  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) {
    return '';
  }

  return name.slice(index + 1);
}

function associationsByIconKey(groups) {
  return Object.fromEntries(
    Object.entries(groups).flatMap(([iconKey, associations]) =>
      associations.map((association) => [association, iconKey]),
    ),
  );
}
