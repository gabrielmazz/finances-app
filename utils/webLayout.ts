/** Shared layout contract for the responsive Web workspace. */
export const WEB_DESKTOP_BREAKPOINT = 1024;
export const WEB_SIDEBAR_WIDTH = 256;
export const WEB_SIDEBAR_GUTTER = 16;

export const isWebDesktopLayout = (platformOS: string, width: number) =>
	platformOS === 'web' && width >= WEB_DESKTOP_BREAKPOINT;
