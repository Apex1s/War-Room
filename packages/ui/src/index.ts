export interface PlatformInfo {
  kind: 'web' | 'extension';
  authMode: 'anonymous+google' | 'anonymous';
}

export function describePlatform(platform: PlatformInfo): string {
  return `War Room (${platform.kind}, ${platform.authMode})`;
}
