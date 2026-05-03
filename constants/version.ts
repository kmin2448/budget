const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE ?? '';
const pkgVersion = process.env.NEXT_PUBLIC_PKG_VERSION ?? '0.1.0';
const patchNum = String(parseInt(pkgVersion.split('.')[2] ?? '0', 10)).padStart(3, '0');

export const APP_VERSION = `${buildDate}-${patchNum}`;
