import { AsyncQueue } from '@sapphire/async-queue';
import Endpoints from '../../../resources/Endpoints';
import ClientPartyMemberMeta from './ClientPartyMemberMeta';
import PartyMember from './PartyMember';
import { AuthSessionStoreKey } from '../../../resources/enums';
import EpicgamesAPIError from '../../exceptions/EpicgamesAPIError';
import { getUUID } from '../../util/Util';
import { encodeSidekickLoadoutVariants } from '../../util/sidekickVariants';
import { chunkMeta, memberMetaPatch } from '../../util/partyMetaPatch';
import type {
  CosmeticEnlightment, Cosmetics, CosmeticVariant, PartyMemberData, PartyMemberSchema,
} from '../../../resources/structs';
import type Party from './Party';

/**
 * Represents the client's party member
 */
class ClientPartyMember extends PartyMember {
  /**
   * The patch queue
   */
  private patchQueue: AsyncQueue;

  /**
   * The member's meta
   */
  public override meta: ClientPartyMemberMeta;

  /**
   * @param party The party this member belongs to
   * @param data The member data
   */
  constructor(party: Party, data: PartyMemberData) {
    super(party, data);

    this.meta = new ClientPartyMemberMeta(this, data.meta);
    this.patchQueue = new AsyncQueue();

    this.update({ id: this.id, displayName: this.client.user.self!.displayName, externalAuths: this.client.user.self!.externalAuths });

    if (this.client.lastPartyMemberMeta) this.meta.update(this.client.lastPartyMemberMeta, true);
  }

  /**
   * Sends a meta patch to Epicgames's servers
   * @param updated The updated schema
   * @throws {EpicgamesAPIError}
   */
  public async sendPatch(updated: PartyMemberSchema): Promise<void> {
    await this.patchQueue.wait();

    const filtered = memberMetaPatch(updated as Record<string, string>);
    const chunks = chunkMeta(filtered);

    try {
      for (const chunk of chunks) {
        await this.doPatch(chunk);
      }
    } catch (e) {
      this.patchQueue.shift();
      throw e;
    }

    this.patchQueue.shift();
    return undefined;
  }

  public async resyncMeta(attempts = 4): Promise<boolean> {
    const payload = memberMetaPatch(this.meta.schema as Record<string, string>);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.sendPatch(payload as PartyMemberSchema);
        return true;
      } catch {
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
    return false;
  }

  private async doPatch(updated: Record<string, string>): Promise<void> {
    try {
      await this.client.http.epicgamesRequest({
        method: 'PATCH',
        url: `${Endpoints.BR_PARTY}/parties/${this.party.id}/members/${this.id}/meta`,
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          delete: [],
          revision: this.revision,
          update: updated,
        },
      }, AuthSessionStoreKey.Fortnite);
    } catch (e) {
      if (e instanceof EpicgamesAPIError && e.code === 'errors.com.epicgames.social.party.stale_revision') {
        this.revision = parseInt(e.messageVars[1]!, 10);
        return this.doPatch(updated);
      }

      throw e;
    }

    this.revision += 1;

    if (this.client.config.savePartyMemberMeta) this.client.lastPartyMemberMeta = this.meta.schema;
  }

  /**
   * Updates the client party member's readiness
   * @param ready Whether the client party member is ready
   * @throws {EpicgamesAPIError}
   */
  public async setReadiness(ready: boolean) {
    let data = this.meta.get('Default:MatchmakingInfo_j');
    data = this.meta.set('Default:MatchmakingInfo_j', {
      ...data,
      MatchmakingInfo: {
        ...data.MatchmakingInfo,
        readyStatus: ready ? 'Ready' : 'NotReady',
        readyInputType: ready ? 'Touch' : 'Count',
        readyStatusMMId: ready ? getUUID().replaceAll('-', '').toUpperCase() : '',
      },
    });

    await this.sendPatch({
      'Default:MatchmakingInfo_j': data,
    });
  }

  /**
   * Updates the client party member's sitting out state
   * @param sittingOut Whether the client party member is sitting out
   * @throws {EpicgamesAPIError}
   */
  public async setSittingOut(sittingOut: boolean) {
    let data = this.meta.get('Default:MatchmakingInfo_j');
    data = this.meta.set('Default:MatchmakingInfo_j', {
      ...data,
      MatchmakingInfo: {
        ...data.MatchmakingInfo,
        readyStatus: sittingOut ? 'SittingOut' : 'NotReady',
        readyStatusMMId: '',
      },
    });

    await this.sendPatch({
      'Default:MatchmakingInfo_j': data,
    });
  }

  /**
   * Updates the client party member's level
   * @param level The new level
   * @throws {EpicgamesAPIError}
   */
  public async setLevel(level: number) {
    return this.setBattlePass(this.meta.battlepass?.bHasPurchasedPass ?? false, level);
  }

  /**
   * Updates the client party member's battle pass info
   * @param isPurchased Whether the battle pass is purchased
   * @param level The battle pass level
   * @throws {EpicgamesAPIError}
   */
  public async setBattlePass(isPurchased: boolean, level: number) {
    let data = this.meta.get('Default:BattlePassInfo_j');
    data = this.meta.set('Default:BattlePassInfo_j', {
      ...data,
      BattlePassInfo: {
        ...data.BattlePassInfo,
        bHasPurchasedPass: isPurchased,
        passLevel: level,
      },
    });

    await this.sendPatch({
      'Default:BattlePassInfo_j': data,
    });
  }

  /**
   * Updates the client party member's banner
   * @param bannerId The new banner's id
   * @param color The new banner's color
   * @throws {EpicgamesAPIError}
   */
  public async setBanner(bannerId: string, color: string) {
    let data = this.meta.get('Default:MpLoadout1_j');
    data = this.meta.set('Default:MpLoadout1_j', {
      ...data,
      MpLoadout1: {
        ...data.MpLoadout1,
        s: {
          ...data.MpLoadout1?.s,
          li: {
            ...(data.MpLoadout1?.s?.li || {}),
            i: bannerId,
          },
          lc: {
            ...(data.MpLoadout1?.s?.lc || {}),
            i: color,
          },
        },
      },
    });

    await this.sendPatch({
      'Default:MpLoadout1_j': data,
    });
  }

  /**
   * Updates multiple cosmetics for the client party member.
   * If a cosmetic is set to `null`, it will be cleared.
   * If a cosmetic is set to `undefined` or is not provided, it will remain unchanged.
   * @param cosmetics An object specifying the cosmetics to update, including outfit, backpack, pickaxe and shoes.
   * @throws {EpicgamesAPIError}
   */
  public async setCosmetics(cosmetics: Cosmetics = {}) {
    const { outfit, backpack, pickaxe, shoes, sidekick } = cosmetics;
    let data = this.meta.get('Default:MpLoadout1_j');
    let loadoutMetaData = this.meta.get('Default:LoadoutMeta_j');

    const nextSlots = {
      ...(data.MpLoadout1?.s || {}),
    } as Record<string, { i: string; d?: string; v?: Array<string | number> | string }>;

    if (Object.hasOwn(cosmetics, 'outfit')) {
      if (outfit === null) {
        delete nextSlots.ac;
        loadoutMetaData = this.meta.set('Default:LoadoutMeta_j', {
          ...loadoutMetaData,
          LoadoutMeta: {
            ...loadoutMetaData.LoadoutMeta,
            scratchpad: [],
          },
        });
      } else if (outfit !== undefined) {
        nextSlots.ac = {
          i: outfit.id,
          v: outfit.variants?.map((v) => v.variantIndex.toString()) ?? [],
        };

        loadoutMetaData = this.meta.set('Default:LoadoutMeta_j', {
          ...loadoutMetaData,
          LoadoutMeta: {
            ...loadoutMetaData.LoadoutMeta,
            scratchpad:
              outfit.enlightment?.length === 2
                ? [{
                  t: outfit.enlightment[0],
                  v: outfit.enlightment[1],
                }]
                : [],
          },
        });
      }
    }

    if (Object.hasOwn(cosmetics, 'backpack')) {
      if (backpack === null) {
        delete nextSlots.ab;
      } else if (backpack !== undefined) {
        nextSlots.ab = {
          i: backpack.id,
          v: backpack.variants?.map((v) => v.variantIndex.toString()) ?? []
        };
      }
    }

    if (Object.hasOwn(cosmetics, 'pickaxe')) {
      if (pickaxe === null) {
        delete nextSlots.ap;
      } else if (pickaxe !== undefined) {
        nextSlots.ap = {
          i: pickaxe.id,
          v: pickaxe.variants?.map((v) => v.variantIndex.toString()) ?? []
        };
      }
    }

    if (Object.hasOwn(cosmetics, 'shoes')) {
      if (shoes === null) {
        delete nextSlots.as;
      } else if (shoes !== undefined) {
        nextSlots.as = {
          i: shoes.id,
          v: shoes.variants?.map((v) => v.variantIndex.toString()) ?? []
        };
      }
    }

    if (Object.hasOwn(cosmetics, 'sidekick')) {
      if (sidekick === null) {
        delete nextSlots.mm;
      } else if (sidekick !== undefined) {
        const loadoutVariants = sidekick.variantChannels?.length
          ? encodeSidekickLoadoutVariants(sidekick.id, sidekick.variantChannels, sidekick.variants ?? [])
          : sidekick.variants?.map((v) => v.variantIndex.toString()) ?? [];

        nextSlots.mm = {
          i: sidekick.id,
          v: loadoutVariants,
        };
      }
    }


    data = this.meta.set('Default:MpLoadout1_j', {
      ...data,
      MpLoadout1: {
        ...data.MpLoadout1,
        s: nextSlots,
      },
    });

    const patch: PartyMemberSchema = {
      'Default:MpLoadout1_j': data,
    };

    if (Object.hasOwn(cosmetics, 'outfit')) {
      patch['Default:LoadoutMeta_j'] = loadoutMetaData;
    }

    await this.sendPatch(patch);
  }

  /**
   * Updates the client party member's outfit
   * @param id The outfit's ID
   * @param variants The outfit's variants
   * @param enlightment The outfit's enlightment
   * @throws {EpicgamesAPIError}
   */
  public async setOutfit(id: string, variants: CosmeticVariant[] = [], enlightment?: CosmeticEnlightment) {
    return this.setCosmetics({ outfit: { id, variants, enlightment } });
  }

  /**
   * Updates the client party member's backpack
   * @param id The backpack's ID
   * @param variants The backpack's variants
   * @param path The backpack's path in the game files
   * @throws {EpicgamesAPIError}
   */
  public async setBackpack(id: string, variants: CosmeticVariant[] = [], path?: string) {
    return this.setCosmetics({ backpack: { id, variants, path } });
  }

  /**
   * Updates the client party member's pickaxe
   * @param id The pickaxe's ID
   * @param variants The pickaxe's variants
   * @param path The pickaxe's path in the game files
   * @throws {EpicgamesAPIError}
   */
  public async setPickaxe(id: string, variants: CosmeticVariant[] = [], path?: string) {
    return this.setCosmetics({ pickaxe: { id, variants, path } });
  }

  /**
   * Updates the client party member's shoes
   * @param id The shoes' ID
   * @param variants The shoes' variants
   * @param path The shoes' path in the game files
   * @throws {EpicgamesAPIError}
   */
  public async setShoes(id: string, variants: CosmeticVariant[] = [], path?: string) {
    return this.setCosmetics({ shoes: { id, variants, path } })
  }

  /**
   * Updates the client party member's sidekick
   * @param id The sidekick's ID
   * @param variants The sidekick's variants
   * @param path The sidekick's path in the game files
   * @throws {EpicgamesAPIError}
   */
  public async setSidekick(
    id: string,
    variants: CosmeticVariant[] = [],
    path?: string,
    variantChannels?: { t: string; n?: string; o?: { t: string; n?: string }[] }[]
  ) {
    return this.setCosmetics({ sidekick: { id, variants, path, variantChannels } });
  }

  /**
   * Updates the client party member's emote
   * @param id The emote's ID
   * @param path The emote's path in the game files
   * @throws {EpicgamesAPIError}
   */
  public async setEmote(id: string, path?: string) {
    if (this.meta.get('Default:FrontendEmote_j').FrontendEmote.pickable !== 'None') await this.clearEmote();

    let data = this.meta.get('Default:FrontendEmote_j');
    data = this.meta.set('Default:FrontendEmote_j', {
      ...data,
      FrontendEmote: {
        ...data.FrontendEmote,
        pickable: `${path?.replace(/\/$/, '') ?? '/BRCosmetics/Athena/Items/Cosmetics/Dances'}/${id}.${id}`,
        emoteSection: -2,
      },
    });

    await this.sendPatch({
      'Default:FrontendEmote_j': data,
    });
  }

  /**
   * Updates the client party member's emoji
   * @param id The emoji's ID
   * @param path The emoji's path in the game files
   * @throws {EpicgamesAPIError}
   */
  public async setEmoji(id: string, path?: string) {
    return this.setEmote(id, path ?? '/BRCosmetics/Athena/Items/Cosmetics/Dances/Emoji');
  }

  /**
   * Updates the client party member's jam track
   * @param id The track's ID
   * @param path The track's path in the game files
   */
  public async setTrack(id: string, path?: string) {
    if (this.meta.get('Default:FrontendEmote_j').FrontendEmote.pickable !== 'None') await this.clearEmote();

    const trackPath = path?.replace(/\/$/, '') ?? '/SparksSongTemplates/Items/SongParts/';
    const pickable = `${trackPath}/${id}.${id}`;
    const frontendPickable = {
      ...this.meta.get('Default:FrontendEmote_j').FrontendEmote,
      pickable,
      emoteSection: -2,
    };

    const emoteData = this.meta.set('Default:FrontendEmote_j', {
      ...this.meta.get('Default:FrontendEmote_j'),
      FrontendEmote: frontendPickable,
    });

    const sparksData = this.meta.set('Default:FrontendSparksSongPart_j', {
      ...this.meta.get('Default:FrontendSparksSongPart_j'),
      FrontendSparksSongPart: frontendPickable,
    });

    await this.sendPatch({
      'Default:FrontendEmote_j': emoteData,
      'Default:FrontendSparksSongPart_j': sparksData,
    });
  }

  /**
   * Clears the client party member's emote and emoji
   * @throws {EpicgamesAPIError}
   */
  public async clearEmote() {
    let data = this.meta.get('Default:FrontendEmote_j');

    data = this.meta.set('Default:FrontendEmote_j', {
      ...data,
      FrontendEmote: {
        ...data.FrontendEmote,
        pickable: 'None',
        emoteSection: -1,
      },
    });

    const sparksData = this.meta.set('Default:FrontendSparksSongPart_j', {
      ...this.meta.get('Default:FrontendSparksSongPart_j'),
      FrontendSparksSongPart: {
        ...this.meta.get('Default:FrontendSparksSongPart_j').FrontendSparksSongPart,
        pickable: 'None',
        emoteSection: -1,
      },
    });

    await this.sendPatch({
      'Default:FrontendEmote_j': data,
      'Default:FrontendSparksSongPart_j': sparksData,
    });
  }

  /**
   * Clears the client party member's backpack
   * @throws {EpicgamesAPIError}
   */
  public async clearBackpack() {
    return this.setCosmetics({ backpack: null })
  }

  /**
   * Clears the client party member's shoes
   * @throws {EpicgamesAPIError}
   */
  public async clearShoes() {
    return this.setCosmetics({ shoes: null })
  }

  /**
   * Clears the client party member's sidekick
   * @throws {EpicgamesAPIError}
   */
  public async clearSidekick() {
    return this.setCosmetics({ sidekick: null })
  }

  /**
   * Updates the client party member's match state.
   * NOTE: This is visually, the client will not actually join a match
   * @param isPlaying Whether the client is in a match
   * @param playerCount The match player count (must be between 0 and 255)
   * @param startedAt The start date of the match
   * @throws {EpicgamesAPIError}
   */
  public async setPlaying(isPlaying = true, playerCount = 100, startedAt = new Date()) {
    await this.sendPatch({
      'Default:PackedState_j': this.meta.set('Default:PackedState_j', {
        ...this.meta.get('Default:PackedState_j'),
        PackedState: {
          ...this.meta.get('Default:PackedState_j').PackedState,
          location: isPlaying ? 'InGame' : 'PreLobby',
          gameMode: isPlaying ? 'InBattleRoyale' : 'None',
        },
      }),
      'Default:MatchmakingInfo_j': this.meta.set('Default:MatchmakingInfo_j', {
        ...this.meta.get('Default:MatchmakingInfo_j'),
        MatchmakingInfo: {
          ...this.meta.get('Default:MatchmakingInfo_j').MatchmakingInfo,
          hasPreloadedAthena: isPlaying,
        },
      }),
      'Default:NumAthenaPlayersLeft_U': this.meta.set('Default:NumAthenaPlayersLeft_U', playerCount),
      'Default:UtcTimeStartedMatchAthena_s': this.meta.set('Default:UtcTimeStartedMatchAthena_s', startedAt.toISOString()),
    });
  }

  /**
   * Updates the client party member's pre lobby map marker.
   * [0, 0] would be the center of the map
   * @param isSet Whether the marker is set
   * @param locationX The marker x location
   * @param locationY The marker y location
   * @throws {EpicgamesAPIError}
   */
  public async setMarker(isSet: boolean, locationX?: number, locationY?: number) {
    let data = this.meta.get('Default:FrontEndMapMarker_j');

    data = this.meta.set('Default:FrontEndMapMarker_j', {
      ...data,
      FrontEndMapMarker: {
        ...data.FrontEndMapMarker,
        bIsSet: isSet,
        markerLocation: {
          ...data.FrontEndMapMarker.markerLocation,
          x: locationY || 0,
          y: locationX || 0,
        },
      },
    });

    await this.sendPatch({
      'Default:FrontEndMapMarker_j': data,
    });
  }

  /**
   * Updates the client party member's cosmetic stats.
   * Crowns are shown when using the EID_Coronet emote
   * @param crowns The amount of crowns / "Royal Royales"
   * @param rankedProgression The ranked progression
   * @throws {EpicgamesAPIError}
   */
  public async setCosmeticStats(crowns: number, rankedProgression: number) {
    let data = this.meta.get('Default:LoadoutMeta_j');
    const currentStats: { statName: string; statValue: number }[] = data.LoadoutMeta?.stats || [];

    const setStat = (name: string, value: number) => {
      const idx = currentStats.findIndex((s) => s.statName === name);
      if (idx > -1) currentStats[idx].statValue = value;
      else currentStats.push({ statName: name, statValue: value });
    };

    setStat('HabaneroProgression', rankedProgression);
    setStat('TotalRoyalRoyales', crowns);
    setStat('TotalVictoryCrowns', crowns);
    setStat('HasCrown', crowns > 0 ? 1 : 0);

    data = this.meta.set('Default:LoadoutMeta_j', {
      ...data,
      LoadoutMeta: {
        ...data.LoadoutMeta,
        stats: currentStats,
      },
    });

    await this.sendPatch({
      'Default:LoadoutMeta_j': data,
    });
  }
}

export default ClientPartyMember;
