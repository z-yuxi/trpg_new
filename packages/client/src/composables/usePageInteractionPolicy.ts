import type { RouteLocationNormalizedLoaded } from 'vue-router';

export function shouldShowBackButton(route: RouteLocationNormalizedLoaded): boolean {
  if (route.meta?.disableBack) {
    return false;
  }

  if (route.meta?.isPrimaryTab) {
    return false;
  }

  return route.path !== '/';
}
