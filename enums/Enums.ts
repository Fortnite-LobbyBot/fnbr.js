import type {
  PartyPrivacy as IPartyPrivacy, Platform as IPlatform, PresenceOnlineType as IPresenceOnlineType
} from '../resources/structs';

export interface IPartyPrivacyEnum {
  PUBLIC: IPartyPrivacy;
  FRIENDS_ALLOW_FRIENDS_OF_FRIENDS: IPartyPrivacy;
  FRIENDS: IPartyPrivacy;
  PRIVATE_ALLOW_FRIENDS_OF_FRIENDS: IPartyPrivacy;
  PRIVATE: IPartyPrivacy;
}

export interface IPlatformEnum {
  WINDOWS: IPlatform;
  MAC: IPlatform;
  PLAYSTATION: IPlatform;
  XBOX: IPlatform;
  SWITCH: IPlatform;
  IOS: IPlatform;
  ANDROID: IPlatform;
  XBOX_SERIES_X: IPlatform;
  PLAYSTATION_5: IPlatform;
}

export interface PlaylistEnum {
  SOLO: 'playlist_defaultsolo';
  DUO: 'playlist_defaultduo';
  TRIOS: 'playlist_trios';
  SQUAD: 'playlist_defaultsquad';
  CREATIVE: 'playlist_playgroundv2';
  LEGO: 'playlist_juno';
  ROCKET_RACING: 'playlist_delmar';
  FESTIVAL: 'playlist_sparksrhythm';
}

export interface IPresenceOnlineTypeEnum {
  ONLINE: IPresenceOnlineType;
  CHAT: IPresenceOnlineType;
  AWAY: IPresenceOnlineType;
  EXTENDED_AWAY: IPresenceOnlineType;
  DO_NOT_DISTURB: IPresenceOnlineType;
}

export const PartyPrivacy: Readonly<IPartyPrivacyEnum> = Object.freeze({
  PUBLIC: {
    partyType: 'Public',
    inviteRestriction: 'AnyMember',
    onlyLeaderFriendsCanJoin: false,
    presencePermission: 'Anyone',
    invitePermission: 'Anyone',
    acceptingMembers: true,
  } as IPartyPrivacy,
  FRIENDS_ALLOW_FRIENDS_OF_FRIENDS: {
    partyType: 'FriendsOnly',
    inviteRestriction: 'AnyMember',
    onlyLeaderFriendsCanJoin: false,
    presencePermission: 'Anyone',
    invitePermission: 'AnyMember',
    acceptingMembers: true,
  } as IPartyPrivacy,
  FRIENDS: {
    partyType: 'FriendsOnly',
    inviteRestriction: 'LeaderOnly',
    onlyLeaderFriendsCanJoin: true,
    presencePermission: 'Leader',
    invitePermission: 'Leader',
    acceptingMembers: false,
  } as IPartyPrivacy,
  PRIVATE_ALLOW_FRIENDS_OF_FRIENDS: {
    partyType: 'Private',
    inviteRestriction: 'AnyMember',
    onlyLeaderFriendsCanJoin: false,
    presencePermission: 'Noone',
    invitePermission: 'AnyMember',
    acceptingMembers: false,
  } as IPartyPrivacy,
  PRIVATE: {
    partyType: 'Private',
    inviteRestriction: 'LeaderOnly',
    onlyLeaderFriendsCanJoin: true,
    presencePermission: 'Noone',
    invitePermission: 'Leader',
    acceptingMembers: false,
  } as IPartyPrivacy,
});

export const Platform: Readonly<IPlatformEnum> = Object.freeze({
  WINDOWS: 'WIN',
  MAC: 'MAC',
  PLAYSTATION: 'PSN',
  XBOX: 'XBL',
  SWITCH: 'SWT',
  IOS: 'IOS',
  ANDROID: 'AND',
  XBOX_SERIES_X: 'XSX',
  PLAYSTATION_5: 'PS5',
});

export const Playlist: Readonly<PlaylistEnum> = Object.freeze({
  SOLO: 'playlist_defaultsolo',
  DUO: 'playlist_defaultduo',
  TRIOS: 'playlist_trios',
  SQUAD: 'playlist_defaultsquad',
  CREATIVE: 'playlist_playgroundv2',
  LEGO: 'playlist_juno',
  ROCKET_RACING: 'playlist_delmar',
  FESTIVAL: 'playlist_sparksrhythm',
});

export const Language = Object.freeze({
  ARABIC: 'ar',
  GERMAN: 'de',
  ENGLISH: 'en',
  SPANISH: 'es',
  FRENCH: 'fr',
  ITALIAN: 'it',
  JAPANESE: 'ja',
  POLISH: 'pl',
  RUSSIAN: 'ru',
  TURKISH: 'tr',
});

export const Gamemode = Object.freeze({
  BATTLE_ROYALE: 'battleroyale',
  CREATIVE: 'creative',
  SAVE_THE_WORLD: 'savetheworld',
});

export const DefaultSkin = Object.freeze({
  FEMALE_1: 'CID_556_Athena_Commando_F_RebirthDefaultA',
  FEMALE_2: 'CID_557_Athena_Commando_F_RebirthDefaultB',
  FEMALE_3: 'CID_558_Athena_Commando_F_RebirthDefaultC',
  FEMALE_4: 'CID_559_Athena_Commando_F_RebirthDefaultD',
  MALE_1: 'CID_560_Athena_Commando_M_RebirthDefaultA',
  MALE_2: 'CID_561_Athena_Commando_M_RebirthDefaultB',
  MALE_3: 'CID_562_Athena_Commando_M_RebirthDefaultC',
  MALE_4: 'CID_563_Athena_Commando_M_RebirthDefaultD',
});

export const SeasonStart = Object.freeze({
  CH1_S1: 1508889601,
  CH1_S2: 1513209601,
  CH1_S3: 1519257601,
  CH1_S4: 1525132801,
  CH1_S5: 1531353601,
  CH1_S6: 1538006401,
  CH1_S7: 1544054401,
  CH1_S8: 1551312001,
  CH1_S9: 1557360001,
  CH1_S10: 1564617601,
  CH2_S1: 1571097601,
  CH2_S2: 1582156801,
  CH2_S3: 1592352001,
  CH2_S4: 1598486401,
  CH2_S5: 1606867201,
  CH2_S6: 1615852801,
  CH2_S7: 1623110401,
  CH2_S8: 1631491201,
  CH3_S1: 1638662401,
});

export const SeasonEnd = Object.freeze({
  CH1_S1: 1513123200,
  CH1_S2: 1519171200,
  CH1_S3: 1525046400,
  CH1_S4: 1531353600,
  CH1_S5: 1538006400,
  CH1_S6: 1544054400,
  CH1_S7: 1551312000,
  CH1_S8: 1557360000,
  CH1_S9: 1564617600,
  CH1_S10: 1570924800,
  CH2_S1: 1582156800,
  CH2_S2: 1592352000,
  CH2_S3: 1598486400,
  CH2_S4: 1606867200,
  CH2_S5: 1615852800,
  CH2_S6: 1623110400,
  CH2_S7: 1631491200,
  CH2_S8: 1638662400,
});

export const PresenceOnlineType: Readonly<IPresenceOnlineTypeEnum> = Object.freeze({
  ONLINE: 'online',
  CHAT: 'chat',
  AWAY: 'away',
  EXTENDED_AWAY: 'xa',
  DO_NOT_DISTURB: 'dnd',
});

export default Object.freeze({
  PartyPrivacy,
  Platform,
  Playlist,
  Language,
  Gamemode,
  DefaultSkin,
  SeasonStart,
  SeasonEnd,
  PresenceOnlineType
});
