import Base from '../Base';
import AuthenticationMissingError from '../exceptions/AuthenticationMissingError';
import { invalidTokenCodes } from '../../resources/constants';
import EpicgamesAPIError from '../exceptions/EpicgamesAPIError';
import type { AuthSessionStoreKey } from '../../resources/enums';
import type Client from '../Client';

interface RequestHeaders {
  [key: string]: any;
}

export type RequestConfig = {
  method?: string;
  headers?: RequestHeaders;
  data?: any;
  url: string;
  responseType?: 'json' | 'arraybuffer' | 'blob';
};

/**
 * Represents the client's HTTP manager
 * @private
 */
class HTTP extends Base {
  /**
   * @param client The main client
   */
  constructor(client: Client) {
    super(client);
  }

  /**
   * Sends an HTTP request
   * @param config The request config
   * @param retries How many times this request has been retried (5xx errors)
   */
  public async request<T = any>(config: RequestConfig, retries = 0): Promise<T> {
    const reqStartTime = Date.now();
    const { url, method = 'GET', headers = {}, data, responseType } = config;

    let body: any
    const finalHeaders: Record<string, any> = {
      'Accept-Language': this.client.config.language,
      ...this.client.config.defaultHeaders,
      ...headers,
    };

    if (data) {
      if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        body = data
        finalHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (headers['Content-Type'] === 'application/json' || (typeof data === 'object' && !(data instanceof ArrayBuffer))) {
        body = JSON.stringify(data);
        finalHeaders['Content-Type'] = 'application/json';
      } else {
        body = data;
      }
    }

    try {
      const response = await (this.client.config.restFetchAdapter ?? fetch)(this.client.config.restTransformURL ? this.client.config.restTransformURL(url) : url, {
        method,
        headers: finalHeaders,
        body,
      });

      const reqDuration = ((Date.now() - reqStartTime) / 1000);
      this.client.debug(`${method.toUpperCase()} ${url} (${reqDuration.toFixed(2)}s): `
        + `${response.status} ${response.statusText}`, 'http');

      if (!response.ok) {
        let errorData = null;
        let responseBody = '';

        try {
          if (response.headers.get('content-type')?.includes('application/json')) {
            errorData = await response.json();
          } else if (response.headers.get('content-type')?.includes('text')) {
            responseBody = await response.text();
          } else {
            responseBody = await response.text();
          }
        } catch {
        }

        const errorMessage = `HTTP ${response.status}: ${method} ${url}: ${responseBody}`;
        const error = new Error(errorMessage,);

        Object.assign(error, {
          response,
          errorData,
          responseBody,
        });

        throw error;
      }

      const contentType = response.headers.get("Content-Type") || "";

      if (responseType === 'arraybuffer') {
        return await response.arrayBuffer() as unknown as T;
      } else if (responseType === 'blob' || contentType.includes("application/octet-stream")) {
        return await response.blob() as T;
      } else if (responseType === 'json' || contentType.includes("application/json")) {
        return await response.json() as T;
      } else if (responseType === 'formdata' || contentType.includes("multipart/form-data")) {
        return await response.formData() as T;
      } else if (contentType.includes("image/")) {
        const blob = await response.blob();
        return URL.createObjectURL(blob) as unknown as T;
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await response.text();
        return new URLSearchParams(text) as T
      } else {
        return await response.text() as T;
      }

    } catch (err: any) {
      const reqDuration = ((Date.now() - reqStartTime) / 1000);

      this.client.debug(`${method.toUpperCase()} ${url} (${reqDuration.toFixed(2)}s): ${err.name} - ${err.message}`, 'http');

      if (err.response?.status?.toString().startsWith('5') && retries < this.client.config.restRetryLimit) {
        return this.request(config, retries + 1);
      }

      if (err.response?.status === 429 || err.errorData?.errorCode === 'errors.com.epicgames.common.throttled') {
        const retryAfter = parseInt(
          err.response.headers.get('Retry-After') ||
          err.errorData?.messageVars?.[0] ||
          err.errorData?.errorMessage?.match(/(?<=in )\d+(?= second)/)?.[0] ||
          '0',
          10
        );

        if (!Number.isNaN(retryAfter)) {
          const sleepTimeout = (retryAfter * 1000) + 500;
          await new Promise((res) => setTimeout(res, sleepTimeout));

          return this.request(config, retries);
        }

      }

      throw err;
    }
  }

  /**
   * Sends an HTTP request to the Fortnite API
   * @param config The request config
   * @param includeAuthentication Whether to include authentication
   * @throws {EpicgamesAPIError}
   */
  public async epicgamesRequest<T = any>(config: RequestConfig, auth?: AuthSessionStoreKey): Promise<T> {
    if (auth) {
      const authSession = this.client.auth.sessions.get(auth);
      if (!authSession) throw new AuthenticationMissingError(auth);

      await authSession.refreshLock.wait();
    }

    try {
      return await this.request<T>({
        ...config,
        headers: {
          ...config.headers,
          ...(auth && {
            Authorization: `bearer ${this.client.auth.sessions.get(auth)!.accessToken}`,
          }),
        },
      });
    } catch (err: any) {
      if (auth && invalidTokenCodes.includes(err.errorData?.errorCode)) {
        await this.client.auth.sessions.get(auth)!.refresh();
        return this.epicgamesRequest(config, auth);
      }

      if (typeof err.errorData?.errorCode === 'string') {
        throw new EpicgamesAPIError(err.errorData, config, err.response?.status || 500);
      }

      throw err;
    }
  }
}

export default HTTP;
