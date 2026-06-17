import { DEFAULT_ICON_THEME } from './fileIcons';

const SPRITE_NAMESPACE = 'zed-tree-icon';
const SVG_DATA_URI_PATTERN = /^data:image\/svg\+xml(?:;[^,]*)?,/i;
const DATA_URI_CHARSET_PATTERN = /;charset=[^;,]+/i;

const FALLBACK_FILE_SYMBOL = `${SPRITE_NAMESPACE}-file`;
const FALLBACK_CHEVRON_SYMBOL = `${SPRITE_NAMESPACE}-chevron`;

const FALLBACK_ICON_SOURCES_BY_SYMBOL = {
  [FALLBACK_FILE_SYMBOL]: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 5H11" stroke="black" stroke-width="1.2" stroke-linecap="round"/><path d="M3 8H13" stroke="black" stroke-width="1.2" stroke-linecap="round"/><path d="M3 11H9" stroke="black" stroke-width="1.2" stroke-linecap="round"/></svg>',
  [FALLBACK_CHEVRON_SYMBOL]: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4.63281 6.66406L7.99344 9.89844L11.3672 6.66406" stroke="black" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function createPierreTreeIcons(iconTheme = DEFAULT_ICON_THEME) {
  const spriteEntriesBySymbol = new Map(
    Object.entries(FALLBACK_ICON_SOURCES_BY_SYMBOL).map(([symbol, svg]) => [symbol, { svg }]),
  );
  const byFileName = {};
  const byFileExtension = {};

  const fileIcons = iconTheme?.fileIcons ?? DEFAULT_ICON_THEME.fileIcons;
  const symbolForIconKey = (iconKey) => symbolForIconDefinition(iconKey, fileIcons?.[iconKey], spriteEntriesBySymbol);
  const defaultFileSymbol = symbolForIconKey('default') ?? FALLBACK_FILE_SYMBOL;
  const chevronSymbol =
    symbolForIconDefinition('chevron', iconTheme?.chevronIcons?.expanded, spriteEntriesBySymbol) ??
    symbolForIconDefinition('chevron', DEFAULT_ICON_THEME.chevronIcons.expanded, spriteEntriesBySymbol) ??
    FALLBACK_CHEVRON_SYMBOL;

  for (const [fileName, iconKey] of Object.entries(iconTheme?.fileStems ?? {})) {
    const symbol = symbolForIconKey(iconKey);
    if (symbol) {
      byFileName[fileName] = symbol;
    }
  }

  for (const [suffix, iconKey] of Object.entries(iconTheme?.fileSuffixes ?? {})) {
    const symbol = symbolForIconKey(iconKey);
    if (!symbol) {
      continue;
    }

    byFileExtension[suffix] = symbol;
    byFileName[suffix] = symbol;
  }

  return {
    set: 'none',
    colored: false,
    spriteSheet: createSpriteSheet(spriteEntriesBySymbol),
    byFileExtension,
    byFileName,
    remap: {
      'file-tree-icon-chevron': chevronSymbol,
      'file-tree-icon-file': defaultFileSymbol,
    },
  };
}

function symbolForIconDefinition(iconKey, iconDefinition, spriteEntriesBySymbol) {
  const iconPath = iconDefinitionPath(iconDefinition);
  if (!iconPath) {
    return null;
  }

  const symbolId = `${SPRITE_NAMESPACE}-${safeSymbolId(iconKey)}-${safeSymbolId(iconPath)}`;
  if (!spriteEntriesBySymbol.has(symbolId)) {
    const decodedSvg = SVG_DATA_URI_PATTERN.test(iconPath) ? decodeSvgDataUri(iconPath) : null;
    spriteEntriesBySymbol.set(symbolId, decodedSvg ? { svg: decodedSvg } : { maskHref: iconPath });
  }

  return symbolId;
}

function decodeSvgDataUri(iconPath) {
  const commaIndex = iconPath.indexOf(',');
  if (commaIndex < 0) {
    return null;
  }

  const metadata = iconPath.slice(0, commaIndex);
  const payload = iconPath.slice(commaIndex + 1);

  try {
    if (/;base64(?:,|$)/i.test(metadata)) {
      return atob(payload);
    }

    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function createSpriteSheet(spriteEntriesBySymbol) {
  const symbols = Array.from(spriteEntriesBySymbol.entries())
    .map(([symbolId, entry]) => spriteEntryToSymbol(symbolId, entry))
    .filter(Boolean)
    .join('');

  return `<svg data-zed-file-tree-sprite aria-hidden="true" width="0" height="0">${symbols}</svg>`;
}

function spriteEntryToSymbol(symbolId, entry) {
  if (entry.svg) {
    return svgToSymbol(symbolId, entry.svg);
  }

  if (entry.maskHref) {
    return maskHrefToSymbol(symbolId, entry.maskHref);
  }

  return '';
}

function svgToSymbol(symbolId, svg) {
  const normalizedSvg = normalizeSvgForCurrentColor(svg, symbolId);
  const viewBox = extractSvgAttribute(normalizedSvg, 'viewBox') ?? createViewBoxFromDimensions(normalizedSvg) ?? '0 0 16 16';
  const content = extractSvgBody(normalizedSvg);

  if (!content) {
    return '';
  }

  return `<symbol id="${escapeAttribute(symbolId)}" viewBox="${escapeAttribute(viewBox)}">${content}</symbol>`;
}

function maskHrefToSymbol(symbolId, href) {
  const maskId = `${symbolId}-mask`;

  return `<symbol id="${escapeAttribute(symbolId)}" viewBox="0 0 16 16"><mask id="${escapeAttribute(maskId)}" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16" style="mask-type: alpha;"><image href="${escapeAttribute(href)}" width="16" height="16" preserveAspectRatio="xMidYMid meet"/></mask><rect width="16" height="16" fill="currentColor" mask="url(#${escapeAttribute(maskId)})"/></symbol>`;
}

function normalizeSvgForCurrentColor(svg, symbolId) {
  const internalIdPrefix = `${symbolId}-`;

  return String(svg ?? '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!doctype[\s\S]*?>/gi, '')
    .replace(/fill=(["'])#?000(?:000)?\1/gi, 'fill="currentColor"')
    .replace(/fill=(["'])black\1/gi, 'fill="currentColor"')
    .replace(/stroke=(["'])#?000(?:000)?\1/gi, 'stroke="currentColor"')
    .replace(/stroke=(["'])black\1/gi, 'stroke="currentColor"')
    .replace(/\sid=(["'])([^"']+)\1/gi, (_match, quote, value) => ` id=${quote}${internalIdPrefix}${value}${quote}`)
    .replace(/url\(#([^)]+)\)/gi, `url(#${internalIdPrefix}$1)`)
    .replace(/\shref=(["'])#([^"']+)\1/gi, (_match, quote, value) => ` href=${quote}#${internalIdPrefix}${value}${quote}`)
    .replace(/\sxlink:href=(["'])#([^"']+)\1/gi, (_match, quote, value) => ` xlink:href=${quote}#${internalIdPrefix}${value}${quote}`);
}

function extractSvgBody(svg) {
  const match = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  return match?.[1]?.trim() ?? '';
}

function extractSvgAttribute(svg, attributeName) {
  const match = svg.match(new RegExp(`\\s${attributeName}=(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function createViewBoxFromDimensions(svg) {
  const width = numericSvgDimension(extractSvgAttribute(svg, 'width'));
  const height = numericSvgDimension(extractSvgAttribute(svg, 'height'));

  if (!width || !height) {
    return null;
  }

  return `0 0 ${width} ${height}`;
}

function numericSvgDimension(value) {
  const match = String(value ?? '').match(/^(\d+(?:\.\d+)?)/);
  return match?.[1] ?? null;
}

function safeSymbolId(value) {
  return String(value ?? 'icon')
    .replace(SVG_DATA_URI_PATTERN, 'data-')
    .replace(DATA_URI_CHARSET_PATTERN, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 96);
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function iconDefinitionPath(iconDefinition) {
  if (typeof iconDefinition === 'string') {
    return iconDefinition;
  }

  return iconDefinition?.path ?? null;
}
