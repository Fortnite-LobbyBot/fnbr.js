import Endpoints from '../../resources/Endpoints';
import Base from '../Base';
import Party from '../structures/party/Party';
import ReceivedPartyInvitation from '../structures/party/ReceivedPartyInvitation';
import ReceivedPartyJoinRequest from '../structures/party/ReceivedPartyJoinRequest';
import FriendNotFoundError from '../exceptions/FriendNotFoundError';
import EpicgamesAPIError from '../exceptions/EpicgamesAPIError';
import { AuthSessionStoreKey } from '../../resources/enums';
import { lobbyIdFor } from '../util/partyMetaPatch';
import type Client from '../Client';
import type { PartyData } from '../../resources/structs';
import type Friend from '../structures/friend/Friend';

const NOTIFICATION_PREFIX = 'party.v2.';
const HANDLED_INVITE_TTL_MS = 60_000;

function stringField(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function partyIdOf(payload: Record<string, unknown>): string {
  const direct = stringField(payload, ['party_id', 'partyId']);
  if (direct) return direct;
  const party = payload.party as Record<string, unknown> | undefined;
  return party ? stringField(party, ['id', 'party_id']) : '';
}

function senderOf(payload: Record<string, unknown>): string {
  return stringField(payload, ['sent_by', 'sender_id', 'senderId', 'inviter_id', 'from_account_id', 'requester_id', 'account_id']);
}

/**
 * Handles EOS Party v2 invite notifications and join requests.
 */
class EOSPartyInviteManager extends Base {
  private handledInvites = new Map<string, number>();

  private epicPartyRevision = 0;

  constructor(client: Client) {
    super(client);
  }

  public async setJoinability(eosPartyId: string, joinability: string, retried = false): Promise<void> {
    try {
      await this.client.http.epicgamesRequest({
        method: 'PATCH',
        url: `${Endpoints.EOS_PARTY_INTERNAL}/parties/${eosPartyId}`,
        headers: { 'Content-Type': 'application/json' },
        data: { config: { joinability }, revision: this.epicPartyRevision },
      }, AuthSessionStoreKey.FortniteEOS);
      this.epicPartyRevision += 1;
    } catch (error) {
      if (!retried && error instanceof EpicgamesAPIError && error.code.endsWith('stale_revision')) {
        return this.setJoinability(eosPartyId, joinability, true);
      }
      this.client.debug(`[EOSParty] joinability ${joinability} failed: ${(error as Error).message}`);
    }
  }

  public async acceptJoinRequest(requesterId: string): Promise<void> {
    if (!this.client.party) {
      await this.client.createParty();
    }
    if (!this.client.party) throw new Error('No party to invite the requester into.');
    await this.client.party.invite(requesterId);
  }

  public async declineJoinRequest(requesterId: string): Promise<void> {
    const accountId = this.client.user.self!.id;
    await this.client.http.epicgamesRequest({
      method: 'DELETE',
      url: `${Endpoints.EOS_PARTY_INTERNAL}/users/${accountId}/joinRequests/${requesterId}`,
    }, AuthSessionStoreKey.FortniteEOS).catch((error: Error) => {
      this.client.debug(`[EOSParty] join request decline failed: ${error.message}`);
    });
  }

  public async handleNotification(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!type.startsWith(NOTIFICATION_PREFIX)) return;

    const event = type.slice(NOTIFICATION_PREFIX.length);
    const partyId = partyIdOf(payload);
    const accountId = stringField(payload, ['account_id', 'accountId']);
    this.client.debug(`[EOSParty] notification: ${event}${partyId ? ` (${partyId.slice(0, 8)})` : ''}${accountId ? ` ${accountId.slice(0, 8)}` : ''}`);

    try {
      if (/INVITE/.test(event)) {
        if (/EXPIRED|DECLINED|CANCEL|REJECT|REMOVED|DELETED/.test(event)) return;
        if (partyId) await this.handleInviteNotification(partyId, senderOf(payload), event);
        return;
      }

      if (/JOIN_REQUEST|INTENTION/.test(event)) {
        if (/EXPIRED|CANCEL|DECLINED/.test(event)) return;
        await this.handleJoinRequestNotification(payload, event);
      }
    } catch (error) {
      this.client.debug(`[EOSParty] notification ${event} failed: ${(error as Error).message}`);
    }
  }

  private async handleInviteNotification(partyId: string, senderId: string, source: string): Promise<void> {
    const now = Date.now();
    for (const [id, at] of this.handledInvites) {
      if (now - at > HANDLED_INVITE_TTL_MS) this.handledInvites.delete(id);
    }
    if (this.handledInvites.has(partyId)) return;
    this.handledInvites.set(partyId, now);

    const localEosPartyId = this.client.party?.eosPartyId;
    if (localEosPartyId === partyId) return;

    this.client.debug(`[EOSParty] invite from ${senderId || 'unknown'} to ${partyId} (${source})`);

    const buildId = (this.client.config.partyBuildId || '').split(':').pop() || '';
    const lobbyId = buildId ? lobbyIdFor(partyId, Number(buildId)) : partyId;

    const stub: PartyData = {
      id: lobbyId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      config: {
        type: 'DEFAULT',
        joinability: 'OPEN',
        discoverability: 'ALL',
        sub_type: 'default',
        max_size: 16,
        invite_ttl: 3600,
        join_confirmation: false,
        intention_ttl: 60,
      },
      members: [],
      meta: {},
      invites: [],
      revision: 0,
    };

    let friend: Friend | undefined = this.client.friend.list.get(senderId);
    if (!friend) {
      try {
        const result = await this.client.waitForEvent('friend:added', 3000, (f) => f.id === senderId);
        friend = result[0];
      } catch {
        friend = undefined;
      }
    }
    if (!friend) throw new FriendNotFoundError(senderId);

    const party = new Party(this.client, stub);
    const invitation = new ReceivedPartyInvitation(
      this.client,
      party,
      friend,
      this.client.user.self!,
      { sent_at: new Date().toISOString() },
    );
    invitation.eosPartyId = partyId;

    if (this.client.listenerCount('party:invite') > 0) {
      this.client.emit('party:invite', invitation);
    }
  }

  private async handleJoinRequestNotification(payload: Record<string, unknown>, source: string): Promise<void> {
    const requesterId = stringField(payload, ['requester_id', 'requesterId', 'sent_by', 'account_id']);
    if (!requesterId) return;

    const key = `join:${requesterId}:${stringField(payload, ['sent_at', 'sent'])}`;
    const now = Date.now();
    const seen = this.handledInvites.get(key);
    if (seen && now - seen < HANDLED_INVITE_TTL_MS * 60) return;
    this.handledInvites.set(key, now);

    const displayName = stringField(payload, ['requester_dn', 'requesterDn', 'display_name']);
    this.client.debug(`[EOSParty] join request from ${displayName || requesterId} (${source})`);

    let friend: Friend | undefined = this.client.friend.list.get(requesterId);
    if (!friend) {
      try {
        const result = await this.client.waitForEvent('friend:added', 3000, (f) => f.id === requesterId);
        friend = result[0];
      } catch {
        friend = undefined;
      }
    }
    if (!friend) throw new FriendNotFoundError(requesterId);

    const request = new ReceivedPartyJoinRequest(
      this.client,
      friend,
      this.client.user.self!,
      {
        sent_at: stringField(payload, ['sent', 'sent_at']) || new Date().toISOString(),
        epic: true,
      },
    );

    this.client.emit('party:joinrequest', request);
  }
}

export default EOSPartyInviteManager;
