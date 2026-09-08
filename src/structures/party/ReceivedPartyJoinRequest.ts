import BasePartyJoinRequest from './BasePartyJoinRequest';
import type ClientUser from '../user/ClientUser';
import type Friend from '../friend/Friend';
import type Client from '../../Client';

/**
 * Represents an incoming party join request
 */
class ReceivedPartyJoinRequest extends BasePartyJoinRequest {
  public override receiver: ClientUser;
  public override sender: Friend;

  public epic: boolean;

  /**
   * @param client The main client
   * @param sender The user who requested to join the party
   * @param receiver The user who received the join request
   * @param data The party confirmation data
   */
  constructor(client: Client, sender: Friend, receiver: ClientUser, data: any) {
    super(client, sender, receiver, data);

    this.sender = sender;
    this.receiver = receiver;
    this.epic = data?.epic ?? false;
  }

  /**
   * Accepts the join request. If it expired, a normal invite will be sent
   * @throws {PartyAlreadyJoinedError} The user is already a member of this party
   * @throws {PartyMaxSizeReachedError} The party reached its max size
   * @throws {EpicgamesAPIError}
   */
  public async accept() {
    if (this.epic) {
      await this.client.eosPartyInvites.acceptJoinRequest(this.sender.id);
      return;
    }

    return this.client.invite(this.sender.id);
  }

  /**
   * Declines the join request
   */
  public async decline() {
    if (this.epic) {
      await this.client.eosPartyInvites.declineJoinRequest(this.sender.id);
    }
  }
}

export default ReceivedPartyJoinRequest;
