import { URLSearchParams } from 'url';
import AuthSession from './AuthSession';
import { AuthSessionType } from '../../resources/enums';
import Endpoints from '../../resources/Endpoints';
import type Client from '../Client';
import type { EOSDeploymentAuthData } from '../../resources/structs';
import { DEFAULT_EOS_USER_AGENT, eosVersionHeader } from '../util/eosConstants';

class EOSDeploymentAuthSession extends AuthSession<AuthSessionType.EOSDeployment> {
  public nonce: string;
  public features: string[];
  public organizationId: string;
  public productId: string;
  public sandboxId: string;
  public deploymentId: string;
  public organizationUserId: string;
  public productUserId: string;
  public productUserIdCreated: boolean;
  public idToken: string;

  public refreshTimeout?: NodeJS.Timeout;

  constructor(client: Client, data: EOSDeploymentAuthData, clientSecret: string) {
    super(client, {
      access_token: data.access_token,
      expires_at: data.expires_at,
      expires_in: data.expires_in,
      token_type: data.token_type,
      account_id: data.product_user_id,
      client_id: data.deployment_id,
    }, clientSecret, AuthSessionType.EOSDeployment);

    this.nonce = data.nonce;
    this.features = data.features;
    this.organizationId = data.organization_id;
    this.productId = data.product_id;
    this.sandboxId = data.sandbox_id;
    this.deploymentId = data.deployment_id;
    this.organizationUserId = data.organization_user_id;
    this.productUserId = data.product_user_id;
    this.productUserIdCreated = data.product_user_id_created;
    this.idToken = data.id_token;
  }

  public async verify() {
    return !this.isExpired;
  }

  public async revoke() {
    clearTimeout(this.refreshTimeout);
    this.refreshTimeout = undefined;
  }

  public async refresh() {
    if (this.refreshLock.isLocked) {
      await this.refreshLock.wait();
      return;
    }

    this.refreshLock.lock();

    try {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = undefined;

      const session = await this.client.auth.fortniteEOSDeploymentAuthenticate();

      this.accessToken = session.accessToken;
      this.expiresAt = session.expiresAt;
      this.nonce = session.nonce;
      this.features = session.features;
      this.organizationId = session.organizationId;
      this.productId = session.productId;
      this.sandboxId = session.sandboxId;
      this.deploymentId = session.deploymentId;
      this.organizationUserId = session.organizationUserId;
      this.productUserId = session.productUserId;
      this.productUserIdCreated = session.productUserIdCreated;
      this.idToken = session.idToken;

      this.initRefreshTimeout();
    } finally {
      this.refreshLock.unlock();
    }
  }

  public initRefreshTimeout() {
    clearTimeout(this.refreshTimeout);
    this.refreshTimeout = setTimeout(() => this.refresh(), this.expiresAt.getTime() - Date.now() - 5 * 60 * 1000);
  }

  public static async create(client: Client, clientId: string, clientSecret: string, externalAuthToken: string, deploymentId: string) {
    const eosUa = client.config.defaultHeaders?.['User-Agent']?.includes('EOS-SDK/')
      ? client.config.defaultHeaders['User-Agent']
      : DEFAULT_EOS_USER_AGENT;
    const eosVersion = eosVersionHeader(client.config.eosVersion);

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'Accept-Encoding': 'identity',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'X-Epic-Correlation-ID': `EOS-${Math.random().toString(36).substring(2, 15)}`,
      'User-Agent': eosUa,
      'X-EOS-Version': eosVersion,
    };

    let authRes = await client.http.request<EOSDeploymentAuthData | {
      errorCode: string
      errorMessage: string
      messageVars: string[]
      numericErrorCode: number
      originatingService: string
      intent: string
      nonce: string
      continuation_token?: string
      expires_at: string
      expires_in: number
    }
    >({
      method: 'POST',
      url: Endpoints.EOS_DEPLOYMENT_TOKEN,
      headers,
      data: new URLSearchParams({
        grant_type: 'external_auth',
        external_auth_type: 'epicgames_access_token',
        external_auth_token: externalAuthToken,
        deployment_id: deploymentId,
        nonce: Math.random().toString(36).substring(2, 15),
      }).toString(),
    }).catch((err: any) => (err && 'errorData' in err) ? err.errorData : err);

    if (authRes && 'errorCode' in authRes) {
      if (authRes.continuation_token) {
        authRes = await client.http.request<EOSDeploymentAuthData>({
          method: 'POST',
          url: Endpoints.EOS_USERS,
          headers: { ...headers, Authorization: `Bearer ${authRes.continuation_token}` },
        });
      } else {
        throw new Error(`[AUTH] EOS Deployment token request failed: ${authRes.errorMessage} ${JSON.stringify(authRes ?? {})}`);
      }
    }

    const session = new EOSDeploymentAuthSession(client, authRes as EOSDeploymentAuthData, clientSecret);
    session.initRefreshTimeout();

    return session;
  }
}

export default EOSDeploymentAuthSession;
