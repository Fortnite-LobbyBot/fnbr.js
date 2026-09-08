const LOBBY_ID_PATTERN = /^([0-9a-f]{32})-(\d+)-([A-Za-z0-9_-]+)$/;
const LOBBY_SUB_TYPE = 'default';
const MEMBER_META_PREFIX = 'Default:';
const MAX_PATCH_KEYS = 32;

const LOBBY_CFG_KEYS = new Set([
  'urn:epic:cfg:invite-perm_s',
  'urn:epic:cfg:accepting-members_b',
  'urn:epic:cfg:build-id_s',
  'urn:epic:cfg:not-accepting-members-reason_i',
]);

const LOBBY_STRICT_KEYS = new Set([
  ...LOBBY_CFG_KEYS,
  'Default:PrimaryGameSessionId_s',
  'Default:PartyState_s',
  'Default:CampaignInfo_j',
  'Default:ZoneInstanceId_s',
  'Default:CreativeDiscoverySurfaceRevisions_j',
  'Default:CustomMatchKey_s',
  'Default:PartyMatchmakingInfo_j',
  'Default:PartyIsJoinedInProgress_b',
  'Default:GameSessionKey_s',
  'Default:AllowJoinInProgress_b',
  'Default:LFGTime_s',
  'Default:SquadInformation_j',
  'Default:RegionId_s',
  'Default:PrivacySettings_j',
  'Default:PlatformSessions_j',
  'Default:AthenaSquadFill_b',
  'Default:LeaderData_j',
  'Default:CreativeInGameReadyCheckStatus_s',
  'Default:PreferredPrivacy_s',
  'Default:PlaylistData_j',
  'Default:SelectedIsland_j',
  'Default:CurrentRegionId_s',
]);

export interface LobbyIdParts {
  epicPartyId: string;
  netCL: number;
  subType: string;
}

export function parseLobbyId(id: string): LobbyIdParts | null {
  const match = LOBBY_ID_PATTERN.exec(id);
  if (!match) return null;
  return { epicPartyId: match[1]!, netCL: Number(match[2]), subType: match[3]! };
}

export function lobbyIdFor(epicPartyId: string, netCL: number): string {
  return `${epicPartyId}-${netCL}-${LOBBY_SUB_TYPE}`;
}

export function memberMetaPatch(schema: Record<string, string>): Record<string, string> {
  const update: Record<string, string> = {};
  for (const key of Object.keys(schema)) {
    if (key.startsWith(MEMBER_META_PREFIX)) update[key] = schema[key]!;
  }
  return update;
}

export function lobbyMetaPatch(update: Record<string, string>, strict: boolean): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const key of Object.keys(update)) {
    if (key === 'VoiceChat:implementation_s' || key === 'urn:epic:cfg:presence-perm_s') continue;
    const allowed = strict
      ? LOBBY_STRICT_KEYS.has(key)
      : key.startsWith('Default:') || LOBBY_CFG_KEYS.has(key);
    if (allowed) filtered[key] = update[key]!;
  }
  return filtered;
}

export function chunkMeta(update: Record<string, string>, size = MAX_PATCH_KEYS): Array<Record<string, string>> {
  const keys = Object.keys(update);
  if (keys.length <= size) return [update];
  const chunks: Array<Record<string, string>> = [];
  for (let start = 0; start < keys.length; start += size) {
    chunks.push(Object.fromEntries(keys.slice(start, start + size).map((key) => [key, update[key]!])));
  }
  return chunks;
}
