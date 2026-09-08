export default class WebSocket {
  public static OPEN = 1;
  public static CONNECTING = 0;
  public static CLOSING = 2;
  public static CLOSED = 3;

  private socket: globalThis.WebSocket;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(url: string | URL, options?: string | string[] | { headers?: Record<string, string>, [key: string]: any }) {
    const isNode = typeof process !== 'undefined' && (process as any).release?.name === 'node';
    const isBun = typeof Bun !== 'undefined' || (typeof process !== 'undefined' && (process as any).versions?.bun !== undefined);

    if (isNode || isBun) {
      this.socket = new globalThis.WebSocket(url, options as any);
    } else {
      this.socket = new globalThis.WebSocket(url);
    }

    this.socket.onopen = (ev) => this.emit('open', ev);
    this.socket.onmessage = (ev) => this.emit('message', ev.data);
    this.socket.onerror = (ev: any) => {
      if (!ev.message) ev.message = 'WebSocket connection failed';
      this.emit('error', ev);
    };
    this.socket.onclose = (ev) => this.emit('close', ev.code, ev.reason);
  }

  public get readyState() {
    return this.socket.readyState;
  }

  public send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.socket.send(data as any);
  }

  public close(code?: number, reason?: string) {
    this.socket.close(code, reason);
  }

  public on(event: string, listener: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  public once(event: string, listener: (...args: any[]) => void) {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  public off(event: string, listener: (...args: any[]) => void) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
    return this;
  }

  public removeAllListeners(event?: string) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }

  private emit(event: string, ...args: any[]) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => listener(...args));
    }
  }
}
