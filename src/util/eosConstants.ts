export const DEFAULT_EOS_VERSION = '1.19.4210.0-57262110@Fortnite';
export const DEFAULT_GAME_BUILD = '++Fortnite+Release-42.10-CL-57566230';
export const EOS_OS_TOKEN = 'Windows/10.0.26100.9278.64bit';

export function eosUserAgent(eosVersion: string, gameBuild: string): string {
  return `EOS-SDK/${eosVersion} (${EOS_OS_TOKEN}) Fortnite/${gameBuild}`;
}

export const DEFAULT_EOS_USER_AGENT = eosUserAgent(DEFAULT_EOS_VERSION, DEFAULT_GAME_BUILD);

export function eosVersionHeader(eosVersion: string): string {
  return eosVersion.includes('@') ? eosVersion.split('@')[0]! : eosVersion;
}

export function gameBuildFromUserAgent(userAgent: string): string {
  return userAgent.match(/Fortnite\/(\S+)/)?.[1] ?? DEFAULT_GAME_BUILD;
}
