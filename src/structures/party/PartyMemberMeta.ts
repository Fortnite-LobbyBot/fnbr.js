import Meta from '../../util/Meta';
import type {
  BannerMeta, BattlePassMeta, CosmeticsVariantMeta, PartyMemberIsland, MatchMeta, PartyMemberSchema, Platform,
} from '../../../resources/structs';
import { decodeSidekickLoadoutVariants } from '../../util/sidekickVariants';

/**
 * Represents a party member meta
 */
class PartyMemberMeta extends Meta<PartyMemberSchema> {
  private get loadout1Slots() {
    return this.get('Default:MpLoadout1_j')?.MpLoadout1?.s || {};
  }

  private get loadout2Slots() {
    return this.get('Default:MpLoadout2_j')?.MpLoadout2?.s || {};
  }

  private get loadoutSlots() {
    return this.loadout1Slots;
  }

  private readLoadoutSlotId(slot?: { i?: string; v?: (string | number)[] }) {
    if (slot?.i) return slot.i;
    const firstVariant = slot?.v?.[0];
    if (firstVariant == null) return undefined;
    return `${firstVariant}`;
  }

  private readBannerColorSlot(slot?: { i?: string; v?: (string | number)[] }) {
    if (slot?.i && /^DefaultColor\d+$/i.test(slot.i)) return slot.i;

    for (const variant of slot?.v ?? []) {
      const value = `${variant}`;
      if (/^DefaultColor\d+$/i.test(value)) return value;
    }

    return undefined;
  }

  /**
   * The currently equipped outfit CID
   */
  public get outfit(): string | undefined {
    return this.loadoutSlots?.ac?.i;
  }

  /**
   * The currently equipped pickaxe ID
   */
  public get pickaxe(): string | undefined {
    return this.loadoutSlots?.ap?.i;
  }
  /**
   * The current emote EID
   */
  public get emote(): string | undefined {
    const emoteAsset: string = this.get('Default:FrontendEmote_j')?.FrontendEmote?.pickable;
    if (emoteAsset === 'None' || !emoteAsset) return undefined;
    const match = emoteAsset.match(/\w*\.(\w*)/);
    return match?.[1];
  }

  /**
   * The currently equipped backpack BID
   */
  public get backpack(): string | undefined {
    return this.loadoutSlots?.ab?.i;
  }

  /**
   * The currently equipped shoes
   */
  public get shoes(): string | undefined {
    return this.loadoutSlots?.as?.i;
  }

  /**
   * The currently equipped sidekick ID
   */
  public get sidekick(): string | undefined {
    const id = this.loadoutSlots?.mm?.i;
    if (!id) return undefined;
    return id.replace(/^CosmeticMimosa:/, '');
  }

  /**
   * Whether the member is ready
   */
  public get isReady() {
    return this.get('Default:MatchmakingInfo_j')?.MatchmakingInfo?.readyStatus === 'Ready';
  }

  /**
   * Whether the member is sitting out
   */
  public get isSittingOut() {
    return this.get('Default:MatchmakingInfo_j')?.MatchmakingInfo?.readyStatus === 'SittingOut';
  }

  /**
   * The current input method
   */
  public get input(): string | undefined {
    return this.get('Default:MatchmakingInfo_j')?.MatchmakingInfo?.currentInputType;
  }

  /**
   * The cosmetic variants
   */
  public get variants(): CosmeticsVariantMeta {
    const slots = this.loadoutSlots;

    const mimosaVariants = decodeSidekickLoadoutVariants(
      slots.mm?.v as Record<string, string> | string[] | undefined
    );

    return {
      athenaCharacter: slots.ac?.v ? { i: slots.ac.v.map((v: string | number) => `${v}`) } : undefined,
      athenaBackpack: slots.ab?.v ? { i: slots.ab.v.map((v: string | number) => `${v}`) } : undefined,
      athenaPickaxe: slots.ap?.v ? { i: slots.ap.v.map((v: string | number) => `${v}`) } : undefined,
      athenaShoes: slots.as?.v ? { i: slots.as.v.map((v: string | number) => `${v}`) } : undefined,
      athenaSkyDiveContrail: slots.at?.v ? { i: slots.at.v.map((v: string | number) => `${v}`) } : undefined,
      cosmeticMimosa: mimosaVariants ? { i: mimosaVariants } : undefined,
    };
  }

  public get glider(): string | undefined {
    return this.readLoadoutSlotId(this.loadout1Slots.ag);
  }

  public get contrail(): string | undefined {
    return this.readLoadoutSlotId(this.loadout1Slots.at);
  }

  /**
   * The banner info
   */
  public get banner(): BannerMeta | undefined {
    const slots = this.loadout1Slots;
    const slots2 = this.loadout2Slots;
    const athenaBanner = this.get('Default:AthenaBannerInfo_j')?.AthenaBannerInfo;

    const bannerIconId = this.readLoadoutSlotId(slots.li)
      ?? this.readLoadoutSlotId(slots2.li)
      ?? athenaBanner?.bannerIconId;
    const bannerColorId = this.readBannerColorSlot(slots.lc)
      ?? this.readBannerColorSlot(slots2.lc)
      ?? athenaBanner?.bannerColorId;

    if (!bannerIconId && !bannerColorId) return undefined;

    return {
      bannerIconId,
      bannerColorId,
    };
  }

  /**
   * The battle pass info
   */
  public get battlepass(): BattlePassMeta | undefined {
    const info = this.get('Default:BattlePassInfo_j')?.BattlePassInfo;
    if (!info) return undefined;

    return {
      bHasPurchasedPass: !!info.bHasPurchasedPass,
      passLevel: info.passLevel || 0,
    };
  }

  /**
   * The platform
   */
  public get platform(): Platform | undefined {
    return this.get('Default:PlatformData_j')?.PlatformData?.platform?.platformDescription?.name;
  }

  /**
   * The match info
   */
  public get match(): MatchMeta {
    const location = this.get('Default:PackedState_j')?.PackedState?.location;
    const hasPreloadedAthena = this.get('Default:MatchmakingInfo_j')?.MatchmakingInfo?.hasPreloadedAthena;
    const playerCount = this.get('Default:NumAthenaPlayersLeft_U');
    const matchStartedAt = this.get('Default:UtcTimeStartedMatchAthena_s');

    return {
      hasPreloadedAthena,
      location,
      matchStartedAt: matchStartedAt && new Date(matchStartedAt),
      playerCount,
    };
  }

  /**
   * The current island info
   */
  public get island(): PartyMemberIsland {
    const island = this.get('Default:MatchmakingInfo_j')?.MatchmakingInfo?.currentIsland?.island;
    if (typeof island === 'string') return JSON.parse(island);
    return island;
  }

  /**
   * Whether a marker has been set
   */
  public get isMarkerSet(): boolean {
    return !!this.get('Default:FrontEndMapMarker_j')?.FrontEndMapMarker?.bIsSet;
  }

  /**
   * The marker location [x, y] tuple. [0, 0] if there is no marker set
   */
  public get markerLocation(): [number, number] {
    const marker = this.get('Default:FrontEndMapMarker_j')?.FrontEndMapMarker?.markerLocation;
    if (!marker) return [0, 0];

    return [marker.y, marker.x];
  }

  /**
   * Whether the member owns Save The World
   */
  public get hasPurchasedSTW() {
    return !!this.get('Default:PackedState_j')?.PackedState?.hasPurchasedSTW;
  }
}

export default PartyMemberMeta;
