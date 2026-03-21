import Endpoints from '../../resources/Endpoints';
import { AuthSessionStoreKey } from '../../resources/enums';
import Base from '../Base';
import UserNotFoundError from '../exceptions/UserNotFoundError';
import type { ChatMessagePayload } from '../../resources/structs';
import type EOSAuthSession from '../auth/EOSAuthSession';

function customUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// private scope
const generateCustomCorrelationId = () => `EOS-${Date.now()}-${customUUID()}`;

/**
 * Represent's the client's chat manager (dm, party chat) via eos.
 */
class ChatManager extends Base {
  /**
   * Returns the chat namespace, this is the eos deployment id
   */
  public get namespace() {
    return this.client.config.eosDeploymentId;
  }

  public async getConversationId(userId: string) {
    const data = await this.client.http.epicgamesRequest({
      method: 'POST',
      url: `${Endpoints.EOS_CHAT}/v1/public/_/conversations?createIfExists=false`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        title: '',
        type: 'dm',
        members: [this.client.user.self!.id, userId],
      },
    }, AuthSessionStoreKey.FortniteEOS);

    return data.conversationId;
  }

  /**
   * Sends a private message to the specified user
   * @param user the account id or displayname
   * @param message the message object
   * @returns the message id
   */
  public async whisperUser(user: string, message: ChatMessagePayload) {
    const accountId = await this.client.user.resolveId(user);
    if (!accountId) throw new UserNotFoundError(user);

    const conversationId = await this.getConversationId(accountId);
    const { body, signatureString } = this.client.createSignedMessage(conversationId, message.body);

    const eosSession = this.client.auth.sessions.get(AuthSessionStoreKey.FortniteEOS) as EOSAuthSession;

    await this.client.http.epicgamesRequest({
      method: 'POST',
      url: `${Endpoints.EOS_CHAT}/v1/public/_/conversations/${conversationId}/messages?fromAccountId=${this.client.user.self!.id}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${eosSession.easAccessToken}`,
      },
      data: {
        allowedRecipients: [accountId, this.client.user.self!.id],
        message: {
          body,
        },
        isReportable: false,
        metadata: {
          TmV: '2',
          Pub: this.client.keyData.jwt,
          Sig: signatureString,
          PlfNm: this.client.config.platform,
          PlfId: this.client.user.self!.id,
        },
      },
    });

    return conversationId;
  }

  /**
   * Sends a message in the specified conversation (party chat)
   * @param conversationId the conversation id, usually `p-[PARTYID]`
   * @param message the message object
   * @param allowedRecipients the account ids, that should receive the message
   * @returns the message id
   */
  public async sendMessageInConversation(conversationId: string, message: ChatMessagePayload, allowedRecipients: string[]) {
    const { body, signatureString } = this.client.createSignedMessage(conversationId, message.body, 'Party');

    const eosSession = this.client.auth.sessions.get(AuthSessionStoreKey.FortniteEOS) as EOSAuthSession;

    await this.client.http.epicgamesRequest({
      method: 'POST',
      url: `${Endpoints.EOS_CHAT}/v1/public/${this.namespace}/conversations/${conversationId}/messages?fromAccountId=${this.client.user.self!.id}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `bearer ${eosSession.easAccessToken}`,
      },
      data: {
        allowedRecipients: allowedRecipients.filter((id) => id !== this.client.user.self!.id),
        message: {
          body,
        },
        isReportable: false,
        metadata: {
          TmV: '2',
          Pub: this.client.keyData.jwt,
          Sig: signatureString,
          NPM: '1',
          PlfNm: this.client.config.platform,
          PlfId: this.client.user.self!.id,
        },
      },
    });

    return conversationId;
  }
}

export default ChatManager;
