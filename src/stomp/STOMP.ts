import WebSocket from '../util/WebSocket';
import Base from '../Base';
import { AuthSessionStoreKey } from '../../resources/enums';
import AuthenticationMissingError from '../exceptions/AuthenticationMissingError';
import Endpoints from '../../resources/Endpoints';
import ReceivedFriendMessage from '../structures/friend/ReceivedFriendMessage';
import PartyMessage from '../structures/party/PartyMessage';
import FriendPresence from '../structures/friend/FriendPresence';
import PresenceParty from '../structures/party/PresenceParty';
import STOMPConnectionTimeoutError from '../exceptions/STOMPConnectionTimeoutError';
import STOMPMessage from './STOMPMessage';
import STOMPConnectionError from '../exceptions/STOMPConnectionError';
import { decodeSTOMPMessageBody } from '../util/Util';
import type { StompMessageData } from './STOMPMessage';
import type { EOSConnectMessage } from '../../resources/structs';
import type Client from '../Client';

const SEEN_MESSAGE_LIMIT = 256;

/**
 * Represents the client's EOS Connect STOMP manager (i.e. chat messages)
 */
class STOMP extends Base {
  /**
   * The STOMP websocket client
   */
  public connection?: WebSocket;

  /**
   * The stomp connection id (i.e. used for eos presence)
   */
  public connectionId?: string;

  public publicConnectionId?: string;

  public privateConnectionId?: string;

  private easPublicSubId?: string;
  private easPrivateSubId?: string;

  /**
   * The stomp heartbeat interval
   */
  private pingInterval?: NodeJS.Timeout;

  /**
   * The amount of times the stomp connection has been retried
   */
  private connectionRetryCount: number;

  private readonly seenMessages: string[] = [];

  /**
   * @param client The main client
   */
  constructor(client: Client) {
    super(client);

    this.connection = undefined;
    this.pingInterval = undefined;
    this.connectionId = undefined;
    this.publicConnectionId = undefined;
    this.privateConnectionId = undefined;
    this.easPublicSubId = undefined;
    this.easPrivateSubId = undefined;
    this.connectionRetryCount = 0;
  }

  /**
   * Whether the internal websocket is connected
   */
  public get isConnected() {
    return this.connection && this.connection.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to the STOMP server
   * @throws {AuthenticationMissingError} When there is no EOS auth to use for STOMP auth
   * @throws {STOMPConnectionError} When the connection failed for any reason
   */
  public async connect() {
    if (!this.client.auth.sessions.has(AuthSessionStoreKey.FortniteEOS)) {
      throw new AuthenticationMissingError(AuthSessionStoreKey.FortniteEOS);
    }

    this.client.debug('[STOMP] Connecting...');

    const connectionStartTime = Date.now();

    const stopmHeaders = {
      Authorization: `Bearer ${this.client.auth.sessions.get(AuthSessionStoreKey.FortniteEOS)!.accessToken}`,
      'Sec-Websocket-Protocol': 'v10.stomp,v11.stomp,v12.stomp',
      'Epic-Connect-Device-Id': ' ',
      'Epic-Connect-Protocol': 'stomp',
    };

    const stompUrl = `wss://${Endpoints.EOS_STOMP}/v2`;
    const url = this.client.config.wsTransformURL ? this.client.config.wsTransformURL(stompUrl, stopmHeaders) : stompUrl;

    this.connection = new WebSocket(url, {
      headers: stopmHeaders,
    });

    return new Promise<void>((res, rej) => {
      const connectionTimeout = setTimeout(() => {
        this.disconnect();
        rej(new STOMPConnectionTimeoutError(this.client.config.stompConnectionTimeout));
      }, this.client.config.stompConnectionTimeout);

      this.connection!.once('open', () => {
        clearTimeout(connectionTimeout);

        const token = this.client.auth.sessions.get(AuthSessionStoreKey.FortniteEOS)!.accessToken;
        this.sendMessage({
          command: 'CONNECT',
          headers: {
            'accept-version': '1.0,1.1,1.2',
            'heart-beat': '30000,0',
            authorization: `Bearer ${token}`,
          },
        });

        this.registerEvents(res, rej, connectionStartTime);
      });

      this.connection!.once('error', (err) => {
        this.client.debug(`[STOMP] Connection failed: ${err.message}`);

        clearTimeout(connectionTimeout);
        rej(new STOMPConnectionError(err.message));
      });
    });
  }

  private alreadySeen(id: string): boolean {
    if (this.seenMessages.includes(id)) return true;
    this.seenMessages.push(id);
    if (this.seenMessages.length > SEEN_MESSAGE_LIMIT) this.seenMessages.shift();
    return false;
  }

  private dedupKey(data: EOSConnectMessage): string | undefined {
    if (data.id) return data.id;

    if (data.type === 'social.chat.v1.NEW_WHISPER' || data.type === 'social.chat.v1.NEW_MESSAGE') {
      const message = data.payload?.message;
      if (message?.senderId != null && message?.time != null) {
        return `chat:${message.senderId}:${message.time}:${message.body}`;
      }
    }

    return undefined;
  }

  /**
   * Registers the events for the STOMP connection
   */
  private registerEvents(resolve: () => void, reject: (reason?: unknown) => void, connectionStartTime: number) {
    this.connection!.on('close', async (code, reason) => {
this.disconnect();

      if (this.connectionRetryCount < 2) {
        this.client.debug('[STOMP] Disconnected, reconnecting in 5 seconds...');
        this.connectionRetryCount += 1;

        await new Promise((res) => setTimeout(res, 5000));
        await this.connect();
      } else {
        this.client.debug('[STOMP] Disconnected, retry limit reached');
        this.connectionRetryCount = 0;
        throw new STOMPConnectionError(`STOMP WS disconnected, retry limit reached. Reason: ${reason}`, code);
      }
    });

    this.connection!.on('message', async (d: any) => {
      let content: string;
      if (typeof Blob !== 'undefined' && d instanceof Blob) {
        content = await d.text();
      } else if (typeof ArrayBuffer !== 'undefined' && (d instanceof ArrayBuffer || ArrayBuffer.isView(d))) {
        content = new TextDecoder().decode(d as any);
      } else {
        content = d.toString();
      }

      const message = STOMPMessage.fromString(content);

      switch (message.command) {
        case 'CONNECTED': {
          this.pingInterval = setInterval(() => {
            if (this.connection && this.connection.readyState === WebSocket.OPEN) {
              this.connection.send('\n');
            }
          }, 30000);

          const accountId = this.client.user.self!.id;
          const deploymentId = this.client.config.eosDeploymentId;
          const sessionId = message.headers.session || '';
          const token = this.client.auth.sessions.get(AuthSessionStoreKey.FortniteEOS)?.accessToken;
          const easN = `${Math.floor(Math.random() * 0xffffffff) || 1}`;
          this.easPublicSubId = `sub-eas-${easN}`;
          this.easPrivateSubId = `sub-eas-private-${easN}`;
          const easDestination = `deploymentId/${deploymentId}/epicAccountId/${accountId}`;
const easHeaders = {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            'ec-coord-accept-language': 'en',
          };

          this.sendMessage({
            command: 'SUBSCRIBE',
            headers: {
              ...easHeaders,
              id: this.easPublicSubId,
              destination: easDestination,
              ...(sessionId ? { receipt: `sub-0-${sessionId}` } : {}),
            },
          });
          this.sendMessage({
            command: 'SUBSCRIBE',
            headers: {
              ...easHeaders,
              'ec-coord-temporary-subscription': 'parties-internal',
              id: this.easPrivateSubId,
              destination: easDestination,
              ...(sessionId ? { receipt: `sub-1-${sessionId}` } : {}),
            },
          });
          break;
        }
        case 'MESSAGE': {
          if (!message.body) break;

          const data: EOSConnectMessage = JSON.parse(message.body);

          if (data.type === 'core.connect.v1.connected' && this.connectionId) {
            break;
          }

          const dedupKey = this.dedupKey(data);
          if (dedupKey && this.alreadySeen(dedupKey)) break;

          switch (data.type) {
            case 'core.connect.v1.connected':
              this.client.debug(`[STOMP] Successfully connected (${((Date.now() - connectionStartTime) / 1000).toFixed(2)}s)`);
              this.connectionId = data.connectionId;
              if (this.easPublicSubId) {
                this.publicConnectionId = `${data.connectionId}#${this.easPublicSubId}`;
              }
              if (this.easPrivateSubId) {
                this.privateConnectionId = `${data.connectionId}#${this.easPrivateSubId}`;
              }
this.connectionRetryCount = 0;
              if (this.client.xmpp.isConnected) this.client.setStatus();
              resolve();
              break;
            case 'core.connect.v1.connect-failed':
              this.client.debug(`[STOMP] Connection failed: ${data.statusCode} - ${data.message}`);

              reject(new STOMPConnectionError(data.message, data.statusCode));
              break;
            case 'social.chat.v1.NEW_WHISPER': {
              const { senderId, body, time } = data.payload.message;
              const friend = this.client.friend.list.get(senderId);

              if (!friend || senderId === this.client.user.self!.id) return;

              const friendMessage = new ReceivedFriendMessage(this.client, {
                content: decodeSTOMPMessageBody(body),
                author: friend,
                id: data.id!,
                sentAt: new Date(time),
              });

              this.client.emit('friend:message', friendMessage);
              break;
            }
            case 'social.chat.v1.NEW_MESSAGE': {
              if (data.payload.conversation.type === 'dm') {
                const { senderId, body, time } = data.payload.message;
                let friend = this.client.friend.list.get(senderId);

                if (!friend) {
                  try {
                    const result = await this.client.waitForEvent('friend:added', 2000, (f) => f.id === senderId);
                    friend = result[0];
                  } catch {
                    return;
                  }
                }

                if (!friend || senderId === this.client.user.self!.id) return;

                const friendMessage = new ReceivedFriendMessage(this.client, {
                  content: decodeSTOMPMessageBody(body),
                  author: friend,
                  id: data.id!,
                  sentAt: new Date(time),
                });

                this.client.emit('friend:message', friendMessage);
                break;
              }

              const conversationType = data.payload.conversation.type;
              if (conversationType !== 'party' && conversationType !== 'epic_party') return;

              await this.client.partyLock.wait();

              const { conversation: { conversationId }, message: { senderId, body, time } } = data.payload;
              const clientPartyId = this.client.party?.id;
              const matchesParty = !!clientPartyId && (
                conversationType === 'epic_party'
                  ? clientPartyId.startsWith(`${conversationId.replace(/^ep-/, '')}-`)
                  : clientPartyId === conversationId.replace(/^p-/, '')
              );

              if (!this.client.party || !matchesParty || senderId === this.client.user.self!.id) {
                return;
              }

              const authorMember = this.client.party.members.get(senderId);
              if (!authorMember) return;

              const partyMessage = new PartyMessage(this.client, {
                content: decodeSTOMPMessageBody(body),
                author: authorMember,
                sentAt: new Date(time),
                id: data.id!,
                party: this.client.party,
              });

              this.client.emit('party:member:message', partyMessage);
              break;
            }
            case 'presence.v1.UPDATE': {
              const friendId = data.payload.accountId;
              let friend = this.client.friend.list.get(friendId);
              if (!friend) {
                try {
                  const result = await this.client.waitForEvent('friend:added', 1000, (f) => f.id === friendId);
                  friend = result[0];
                } catch {
                  return;
                }
              }
              if (!friend) return;

              if (data.payload.status === 'offline') {
                friend.lastAvailableTimestamp = undefined;
                friend.party = undefined;
                this.client.emit('friend:offline', friend);
                break;
              }

              const wasUnavailable = !friend.lastAvailableTimestamp;
              friend.lastAvailableTimestamp = Date.now();

              const perNs = data.payload.perNs?.find((namespace) => namespace.productId === 'Fortnite')
                || data.payload.perNs?.[0]
                || {};
              const props = perNs.props || data.payload.props || {};
              const activityValue = perNs.activity?.value || data.payload.activity?.value;

              const parsedProps: any = {};
              for (const [key, value] of Object.entries(props)) {
                if (typeof value === 'string' && !key.startsWith('EOS_')) {
                  parsedProps[key] = (value as string).slice(1);
                  try {
                    parsedProps[key] = JSON.parse(parsedProps[key]);
                  } catch { }
                } else {
                  parsedProps[key] = value;
                }
              }

              const mappedData: any = {
                Status: activityValue || perNs.status || data.payload.status || '',
                bIsPlaying: false,
                bIsJoinable: false,
                bHasVoiceSupport: false,
                SessionId: parsedProps.SessionIdAttributeKey || '',
                Properties: {
                  FortBasicInfo_j: parsedProps.FortBasicInfo,
                  FortSubGame_i: parsedProps.FortSubGame,
                  InUnjoinableMatch_b: parsedProps.InUnjoinableMatch === 'true',
                  GamePlaylistName_s: parsedProps.GamePlaylistName || parsedProps.IslandCode,
                  Event_PartySize_s: parsedProps.Event_PartySize?.toString(),
                  Event_PartyMaxSize_s: parsedProps.Event_PartyMaxSize?.toString(),
                  ServerPlayerCount_i: parsedProps.ServerPlayerCount?.toString(),
                  FortGameplayStats_j: parsedProps.FortGameplayStats,
                  'party.joininfodata.286331153_j': parsedProps['party.joininfodata.286331153']
                }
              };

              const show = data.payload.status === 'away' ? 'away' : 'online';
              const from = `fake_jid/${parsedProps.EOS_Platform || 'WIN'}::fake`;

              const before = friend.presence;
              const after = new FriendPresence(this.client, mappedData, friend, show, from);

              if ((this.client.config.cacheSettings.presences?.maxLifetime || 0) > 0) {
                friend.presence = after;
              }

              if (mappedData.Properties?.['party.joininfodata.286331153_j']) {
                friend.party = new PresenceParty(this.client, mappedData.Properties['party.joininfodata.286331153_j']);
              } else {
                friend.party = undefined;
              }

              if (wasUnavailable) {
                this.client.emit('friend:online', friend);
              }

              this.client.emit('friend:presence', before, after);
              break;
            }
            case 'party.v2.MEMBER_EXPIRED_PARTY_DISBANDED': {
              const partyId = data.payload?.party_id as string | undefined;
              const accountId = data.payload?.account_id as string | undefined;
void this.client.recreatePartyAfterEOSDisband('stomp-disbanded', partyId);
              break;
            }
            default:
              if (typeof data.type === 'string' && data.type.startsWith('party.v2.')) {
                void this.client.eosPartyInvites.handleNotification(data.type, data.payload ?? {});
                break;
              }
              this.client.debug(`[STOMP] Unknown message type: ${data.type} ${message.body}`);
          }
        } break;
        default:
          this.client.debug(`[STOMP] Unknown command: ${message.command} ${message.body ?? 'no body'}`);
      }
    });
  }

  /**
   * Disconnects the STOMP client.
   * Also performs a cleanup
   */
  public async disconnect() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }

    if (this.connection) {
      this.connection.removeAllListeners();
      if (this.connection.readyState === WebSocket.OPEN) {
        this.connection.close();
      }
      this.connection = undefined;
    }

    this.connectionId = undefined;
    this.publicConnectionId = undefined;
    this.privateConnectionId = undefined;
    this.easPublicSubId = undefined;
    this.easPrivateSubId = undefined;
    this.seenMessages.length = 0;
  }

  /**
   * Sends a message to the STOMP server
   * @param message The message to send
   */
  private sendMessage(message: StompMessageData) {
    this.connection!.send(new STOMPMessage(message).toString());
  }
}

export default STOMP;
