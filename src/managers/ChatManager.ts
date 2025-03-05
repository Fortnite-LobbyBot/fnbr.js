import Endpoints from '../../resources/Endpoints';
import { AuthSessionStoreKey } from '../../resources/enums';
import Base from '../Base';
import UserNotFoundError from '../exceptions/UserNotFoundError';
import type { ChatMessagePayload } from '../../resources/structs';

function customUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8); // Asegura la variante correcta
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

  /**
   * Sends a private message to the specified user
   * @param user the account id or displayname
   * @param message the message object
   * @returns the message id
   */
  public async whisperUser(user: string, message: ChatMessagePayload) {
    const accountId = await this.client.user.resolveId(user);

    if (!accountId) {
      throw new UserNotFoundError(user);
    }

    const correlationId = generateCustomCorrelationId();

    await this.client.http.epicgamesRequest({
      method: 'POST',
      url: `${Endpoints.EOS_CHAT}/v1/public/${this.namespace}/whisper/${this.client.user.self!.id}/${accountId}`,
      headers: {
        'Content-Type': 'application/json',
        'X-Epic-Correlation-ID': correlationId,
      },
      data: {
        message,
      },
    }, AuthSessionStoreKey.FortniteEOS);

    return correlationId;
  }

  /**
   * Sends a message in the specified conversation (party chat)
   * @param conversationId the conversation id, usually `p-[PARTYID]`
   * @param message the message object
   * @param allowedRecipients the account ids, that should receive the message
   * @returns the message id
   */
  public async sendMessageInConversation(conversationId: string, message: ChatMessagePayload, allowedRecipients: string[]) {
    const correlationId = generateCustomCorrelationId();

    await this.client.http.epicgamesRequest({
      method: 'POST',
      url: `${Endpoints.EOS_CHAT}/v1/public/${this.namespace}/conversations/${conversationId}/messages?fromAccountId=${this.client.user.self!.id}`,
      headers: {
        'Content-Type': 'application/json',
        'X-Epic-Correlation-ID': correlationId,
      },
      data: {
        allowedRecipients,
        message,
      },
    }, AuthSessionStoreKey.FortniteEOS);

    return correlationId;
  }
}

export default ChatManager;
