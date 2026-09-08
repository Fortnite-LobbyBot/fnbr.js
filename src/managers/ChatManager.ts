import Endpoints from '../../resources/Endpoints';
import { AuthSessionStoreKey, ConversationType, SignedMessageType } from '../../resources/enums';
import Base from '../Base';
import { generateCrossPlatformKeyPair, signCrossPlatformMessage, getUUID, isEd25519Supported } from '../util/Util';
import { parseLobbyId } from '../util/partyMetaPatch';
import type { PublicKeyData } from '../../resources/httpResponses';
import type { ChatMessagePayload } from '../../resources/structs';

// private scope
const generateCustomCorrelationId = () => `EOS-${Date.now()}-${getUUID()}`;

/**
 * Represent's the client's chat manager (dm, party chat) via eos.
 */
class ChatManager extends Base {
  /**
   * DM conversations cache map (account id -> conversation id)
   */
  private dmConversations: Map<string, string> = new Map();

  /**
   * The private key for signing messages
   */
  private privateKey?: any;

  /**
   * The public key for verifying messages
   */
  private publicKey?: string;

  /**
   * The public key data registered on epic's servers
   */
  private publicKeyData?: PublicKeyData;

  /**
   * Whether the keypair for message signing exists
   */
  public get keypairExists() {
    return !!this.privateKey && !!this.publicKey;
  }

  /**
   * Whether the keypair has been registered on epic's servers
   */
  public get keypairRegistered() {
    return !!this.publicKeyData;
  }

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
   * @throws {UserNotFoundError} When the specified user was not found
   * @throws {EpicgamesAPIError} When the api request failed
   */
  public async whisperUser(user: string, message: ChatMessagePayload) {
    const accountId = await this.client.user.resolveId(user);

    const conversationId = await this.getDMConversationId(accountId);

    return this.sendMessageInConversation(
      conversationId,
      message,
      [accountId, this.client.user.self!.id],
      ConversationType.DirectMessage,
    );
  }

  /**
   * Sends a message in the specified conversation (e.g. party chat)
   * @param conversationId the conversation id, usually `p-[PARTYID]`
   * @param message the message object
   * @param allowedRecipients the account ids, that should receive the message
   * @returns the message id
   * @throws {EpicgamesAPIError}
   */
  public async sendMessageInConversation(
    conversationId: string,
    message: ChatMessagePayload,
    allowedRecipients: string[],
    conversationType: ConversationType,
  ) {
    const isParty = conversationType === ConversationType.Party;
    const partyId = isParty ? conversationId.replace(/^p-/, '') : conversationId;
    const lobby = isParty ? parseLobbyId(partyId) : null;
    const scope = isParty && !lobby ? this.namespace : '_';
    const addressed = lobby ? `ep-${lobby.epicPartyId}` : isParty ? `p-${partyId}` : conversationId;
    const signedType: SignedMessageType = isParty && !lobby ? SignedMessageType.Party : SignedMessageType.Persistent;
    const correlationId = generateCustomCorrelationId();

    const { body, signature } = await this.createSignedMessage(
      lobby ? addressed : (isParty ? partyId : conversationId),
      message.body,
      signedType,
    );

    await this.client.http.epicgamesRequest({
      method: 'POST',
      url: `${Endpoints.EOS_CHAT}/v1/public/${scope}`
        + `/conversations/${addressed}/messages?fromAccountId=${this.client.user.self!.id}`,
      headers: {
        'Content-Type': 'application/json',
        'X-Epic-Correlation-ID': correlationId,
      },
      data: {
        allowedRecipients,
        message: {
          body,
        },
        isReportable: false,
        metadata: {
          TmV: '2',
          Pub: this.publicKeyData!.jwt,
          Sig: signature,
          NPM: isParty && !lobby ? '1' : undefined,
          PlfNm: this.client.config.platform,
          PlfId: this.client.user.self!.id,
        },
      },
    }, AuthSessionStoreKey.FortniteEOS);

    return correlationId;
  }

  public async createDMConversation(recepientId: string, createIfExists = false) {
    return this.client.http.epicgamesRequest<{
      conversationId: string;
    }>({
      method: 'POST',
      url: `${Endpoints.EOS_CHAT}/v1/public/_/conversations?createIfExists=${createIfExists}`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        title: '',
        type: 'dm',
        members: [this.client.user.self!.id, recepientId],
      },
    }, AuthSessionStoreKey.FortniteEOS);
  }

  /**
   * Ensures that message signing is possible
   */
  public async ensureMessageSigning() {
    if (!(await isEd25519Supported())) {
      throw new Error('Chat/message signing is not supported on this device (Ed25519 cryptography not available).');
    }

    if (!this.keypairExists) {
      await this.generateKeypair();
    }

    if (!this.keypairRegistered) {
      await this.registerKeypair();
    }
  }

  /**
   * Resolves the conversation id for a dm with the specified user
   * @param recepientId The account id of the recepient
   * @returns The conversation id
   */
  private async getDMConversationId(recepientId: string) {
    if (this.dmConversations.has(recepientId)) {
      return this.dmConversations.get(recepientId)!;
    }

    const conversationData = await this.createDMConversation(recepientId);
    this.dmConversations.set(recepientId, conversationData.conversationId);

    return conversationData.conversationId;
  }

  /**
   * Signs a message for the specified conversation
   * @param conversationId The conversation id
   * @param content The message content
   * @param type The signed message type
   */
  private async createSignedMessage(conversationId: string, content: string, type: SignedMessageType) {
    await this.ensureMessageSigning();

    const timestamp = Date.now();

    const messageInfo = {
      mid: getUUID(),
      sid: this.client.user.self!.id,
      rid: conversationId,
      msg: content,
      tst: timestamp,
      seq: 1,
      rec: false,
      mts: [],
      cty: type,
    };

    const body = Buffer.from(JSON.stringify(messageInfo), 'utf-8').toString('base64');
    const messageToSign = Buffer.concat([Buffer.from(body, 'utf-8'), Buffer.from([0])]);

    const signature = await signCrossPlatformMessage(this.privateKey!, messageToSign);

    return { body, signature };
  }

  /**
   * Generates a ed25519 keypair for message signing
   */
  private async generateKeypair() {
    const { privateKey, publicKeyB64 } = await generateCrossPlatformKeyPair();

    this.privateKey = privateKey;
    this.publicKey = publicKeyB64;
  }

  /**
   * Registers the public key on epic's servers
   */
  private async registerKeypair() {
    const publicKeyData = await this.client.http.epicgamesRequest<PublicKeyData>({
      method: 'POST',
      url: `${Endpoints.PUBLICKEY}/v2/publickey/`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        key: this.publicKey,
        algorithm: 'ed25519',
      },
    }, AuthSessionStoreKey.Fortnite);

    this.publicKeyData = publicKeyData;
  }
}

export default ChatManager;