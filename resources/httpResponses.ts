import type { FullPlatform, Region } from './structs';

export interface EpicgamesAPIErrorData {
  errorCode: string;
  errorMessage: string;
  messageVars: string[];
  numericErrorCode: number;
  originatingService: string;
  intent: string;
  error_description: string;
  error: string;
  errorStatus?: number;
}

export interface RawStatsData {
  accountId: string;
  startTime: number;
  endTime: number;
  stats: {
    [key: string]: number;
  };
}

export interface EpicgamesOAuthData {
  access_token: string;
  expires_in: number;
  expires_at: string;
  token_type: string;
  refresh_token: string;
  refresh_expires: number;
  refresh_expires_at: string;
  account_id: string;
  client_id: string;
  internal_client: boolean;
  client_service: string;
  displayName: string;
  app: string;
  in_app_id: string;
  device_id: string;
}

export type PlatformMappings = {
  // eslint-disable-next-line no-unused-vars
  [key in FullPlatform]?: string;
};

export type RegionMappings = {
  // eslint-disable-next-line no-unused-vars
  [key in Region]?: string;
};

export interface BlurlStreamMasterPlaylistData {
  type: 'master';
  language: string;
  url: string;
  data: string;
  duration?: number;
}

export interface BlurlStreamVariantPlaylistData {
  type: 'variant';
  rel_url: string;
  data: string;
}

export interface BlurlStreamData {
  playlists: (BlurlStreamMasterPlaylistData | BlurlStreamVariantPlaylistData)[];
  subtitles: string;
  ucp?: string;
  audioonly?: boolean;
  aspectratio?: string;
  partysync?: boolean;
  lrcs: string;
  duration?: number;
}

export interface CreativeIslandData {
  namespace: string;
  accountId: string;
  creatorName: string;
  mnemonic: string;
  linkType: string;
  metadata: {
    mode: string;
    quicksilver_id: string;
    image_url: string;
    tagline: string;
    islandType: string;
    title: string;
    locale: string;
    matchmaking: {
      selectedJoinInProgressType: number;
      playersPerTeam: number;
      maximumNumberOfPlayers: number;
      override_Playlist: string;
      playerCount: number;
      mmsType: string;
      mmsPrivacy: string;
      numberOfTeams: number;
      bAllowJoinInProgress: boolean;
      minimumNumberOfPlayers: number;
      joinInProgressTeam: number;
    };
    supportCode: string;
    introduction: string;
    generated_image_urls: {
      url_s: string;
      url_m: string;
      compressed: {
        url_s: string;
        url_m: string;
        url: string;
      };
      url: string;
    };
  };
  version: number;
  active: boolean;
  disabled: boolean;
  created: string;
  published: string;
  descriptionTags: string[];
  moderationStatus: string;
}

export interface CreativeDiscoveryPanel {
  PanelName: string;
  Pages: {
    results: {
      linkData: CreativeIslandData;
      isFavorite: boolean;
    }[];
    hasMore: boolean;
  }[];
}
