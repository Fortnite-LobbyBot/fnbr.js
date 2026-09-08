import Endpoints from '../../../resources/Endpoints';
import PartyInvitationExpiredError from '../../exceptions/PartyInvitationExpiredError';
import BasePartyInvitation from './BasePartyInvitation';
import { AuthSessionStoreKey } from '../../../resources/enums';
import type ClientUser from '../user/ClientUser';
import type Friend from '../friend/Friend';
import type Client from '../../Client';
import type Party from './Party';
import type ClientParty from './ClientParty';

/**
 * Represents a recieved party invitation
 */
class ReceivedPartyInvitation extends BasePartyInvitation {
  public override sender: Friend;
  public override receiver: ClientUser;

  public eosPartyId?: string;

  /**
   * @param client The main client
   * @param party The party this invitation belongs to
   * @param sender The friend (or the client user) who sent this invitation
   * @param receiver The friend (or the client user) who received this invitation
   * @param data The invitation data
   */
  constructor(client: Client, party: Party | ClientParty, sender: Friend, receiver: ClientUser, data: any) {
    super(client, party, sender, receiver, data);

    this.sender = sender;
    this.receiver = receiver;
  }

  /**
   * Accepts this invitation
   * @throws {PartyInvitationExpiredError} The invitation already got accepted or declined
   * @throws {EpicgamesAPIError}
   */
  public async accept() {
    if (this.isExpired || this.isHandled) throw new PartyInvitationExpiredError();
if (this.eosPartyId) {
      await this.client.joinEOSParty(this.eosPartyId);
      this.isHandled = true;
      await this.client.http.epicgamesRequest({
        method: 'DELETE',
        url: `${Endpoints.EOS_PARTY_INTERNAL}/users/${this.client.user.self!.id}/invites/${this.sender.id}`,
      }, AuthSessionStoreKey.FortniteEOS).catch(() => undefined);
      return;
    }

    await this.party.join();
    this.isHandled = true;

    await this.client.http.epicgamesRequest({
      method: 'DELETE',
      url: `${Endpoints.BR_PARTY}/user/${this.client.user.self!.id}/pings/${this.sender.id}`,
    }, AuthSessionStoreKey.Fortnite);
  }

  /**
   * Declines this invitation
   * @throws {PartyInvitationExpiredError} The invitation already got accepted or declined
   */
  public async decline() {
    if (this.isExpired || this.isHandled) throw new PartyInvitationExpiredError();

    if (this.eosPartyId) {
      await this.client.http.epicgamesRequest({
        method: 'DELETE',
        url: `${Endpoints.EOS_PARTY_INTERNAL}/users/${this.client.user.self!.id}/invites/${this.sender.id}`,
      }, AuthSessionStoreKey.FortniteEOS);
      this.isHandled = true;
      return;
    }

    await this.client.http.epicgamesRequest({
      method: 'DELETE',
      url: `${Endpoints.BR_PARTY}/user/${this.client.user.self!.id}/pings/${this.sender.id}`,
    }, AuthSessionStoreKey.Fortnite);

    this.isHandled = true;
  }
}

export default ReceivedPartyInvitation;
