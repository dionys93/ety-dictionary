// web/src/config/routeFeatures.js

// Exact-match overrides for pages that need non-default rendering.
const ROUTE_WIDGETS = {
  'orthography/phenomena/great-vowel-shift': 'vowel-shift',
};

// Prefixes that should render as a grid instead of a list.
const GRID_VIEW_PREFIXES = ['dictionary'];

export function getRouteFeatures(routePath) {
  return {
    widget: ROUTE_WIDGETS[routePath] ?? null,
    view: GRID_VIEW_PREFIXES.some(prefix => routePath.startsWith(prefix)) ? 'grid' : 'list',
  };
}