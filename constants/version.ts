const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE ?? '';
const pkgVersion = process.env.NEXT_PUBLIC_PKG_VERSION ?? '0.1.0';

export const APP_VERSION = `${buildDate}-${pkgVersion}`;
