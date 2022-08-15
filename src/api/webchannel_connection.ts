
/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  createWebChannelTransport,
  ErrorCode,
  EventType,
  WebChannel,
  WebChannelError,
  WebChannelOptions,
  FetchXmlHttpFactory,
  XhrIo,
  getStatEventTarget,
  EventTarget,
  StatEvent,
  Event,
  Stat
} from '@firebase/webchannel-wrapper';
/**
 * A bidirectional stream that can be used to send an receive messages.
 *
 * A stream can be closed locally with close() or can be closed remotely or
 * through network errors. onClose is guaranteed to be called. onOpen will only
 * be called if the stream successfully established a connection.
 */
export interface Stream<I, O> {
  onOpen(callback: () => void): void;
  onClose(callback: (err?: Error) => void): void;
  onMessage(callback: (msg: O) => void): void;

  send(msg: I): void;
  close(): void;
}

/**
 * Provides a simple helper class that implements the Stream interface to
 * bridge to other implementations that are streams but do not implement the
 * interface. The stream callbacks are invoked with the callOn... methods.
 */
export class StreamBridge<I, O> implements Stream<I, O> {
  private wrappedOnOpen: (() => void) | undefined;
  private wrappedOnClose: ((err?: Error) => void) | undefined;
  private wrappedOnMessage: ((msg: O) => void) | undefined;

  private sendFn: (msg: I) => void;
  private closeFn: () => void;

  constructor(args: { sendFn: (msg: I) => void; closeFn: () => void }) {
    this.sendFn = args.sendFn;
    this.closeFn = args.closeFn;
  }

  onOpen(callback: () => void): void {
    // debugAssert(!this.wrappedOnOpen, 'Called onOpen on stream twice!');
    this.wrappedOnOpen = callback;
  }

  onClose(callback: (err?: Error) => void): void {
    // debugAssert(!this.wrappedOnClose, 'Called onClose on stream twice!');
    this.wrappedOnClose = callback;
  }

  onMessage(callback: (msg: O) => void): void {
    // debugAssert(!this.wrappedOnMessage, 'Called onMessage on stream twice!');
    this.wrappedOnMessage = callback;
  }

  close(): void {
    this.closeFn();
  }

  send(msg: I): void {
    this.sendFn(msg);
  }

  callOnOpen(): void {
    // debugAssert(
    //     this.wrappedOnOpen !== undefined,
    //     'Cannot call onOpen because no callback was set'
    // );
    // @ts-ignore
    this.wrappedOnOpen();
  }

  callOnClose(err?: Error): void {
    // debugAssert(
    //     this.wrappedOnClose !== undefined,
    //     'Cannot call onClose because no callback was set'
    // );
    // @ts-ignore
    this.wrappedOnClose(err);
  }

  callOnMessage(msg: O): void {
    // debugAssert(
    //     this.wrappedOnMessage !== undefined,
    //     'Cannot call onMessage because no callback was set'
    // );
    // @ts-ignore
    this.wrappedOnMessage(msg);
  }
}

// An Object whose keys and values are strings.
export interface StringMap {
  [key: string]: string;
}

const RPC_STREAM_SERVICE = 'google.firestore.v1.Firestore';

const XHR_TIMEOUT_SECS = 15;

export class WebChannelConnection {
  private readonly forceLongPolling: boolean;
  private readonly autoDetectLongPolling: boolean;
  private readonly useFetchStreams: boolean;
  private readonly baseUrl: string;
  private readonly databaseRoot: string;

  constructor() {
    this.baseUrl = 'http://localhost:8080';
    this.databaseRoot =
        'projects/ios-crash-debug/databases/(default)/documents';
    this.forceLongPolling = false;
    this.autoDetectLongPolling = false;
    this.useFetchStreams = true
  }

  openStream<Req, Resp>(
      rpcName: string
  ): Stream<Req, Resp> {
    const urlParts = [
      this.baseUrl,
      '/',
      RPC_STREAM_SERVICE,
      '/',
      rpcName,
      '/channel'
    ];
    const webchannelTransport = createWebChannelTransport();
    const requestStats = getStatEventTarget();
    const request: WebChannelOptions = {
      // Required for backend stickiness, routing behavior is based on this
      // parameter.
      httpSessionIdParam: 'gsessionid',
      initMessageHeaders: {},
      messageUrlParams: {
        // This param is used to improve routing and project isolation by the
        // backend and must be included in every request.
        database: `projects/ios-crash-debug/databases/(default)`
      },
      sendRawJson: true,
      supportsCrossDomainXhr: true,
      internalChannelParams: {
        // Override the default timeout (randomized between 10-20 seconds) since
        // a large write batch on a slow internet connection may take a long
        // time to send to the backend. Rather than have WebChannel impose a
        // tight timeout which could lead to infinite timeouts and retries, we
        // set it very large (5-10 minutes) and rely on the browser's builtin
        // timeouts to kick in if the request isn't working.
        forwardChannelRequestTimeoutMs: 10 * 60 * 1000
      },
      forceLongPolling: this.forceLongPolling,
      detectBufferingProxy: this.autoDetectLongPolling
    };

    if (this.useFetchStreams) {
      request.xmlHttpFactory = new FetchXmlHttpFactory({});
    }

    this.modifyHeadersForRequest(
        request.initMessageHeaders!
    );

    // Sending the custom headers we just added to request.initMessageHeaders
    // (Authorization, etc.) will trigger the browser to make a CORS preflight
    // request because the XHR will no longer meet the criteria for a "simple"
    // CORS request:
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#Simple_requests
    //
    // Therefore to avoid the CORS preflight request (an extra network
    // roundtrip), we use the httpHeadersOverwriteParam option to specify that
    // the headers should instead be encoded into a special "$httpHeaders" query
    // parameter, which is recognized by the webchannel backend. This is
    // formally defined here:
    // https://github.com/google/closure-library/blob/b0e1815b13fb92a46d7c9b3c30de5d6a396a3245/closure/goog/net/rpc/httpcors.js#L32
    //
    // TODO(b/145624756): There is a backend bug where $httpHeaders isn't respected if the request
    // doesn't have an Origin header. So we have to exclude a few browser environments that are
    // known to (sometimes) not include an Origin. See
    // https://github.com/firebase/firebase-js-sdk/issues/1491.

    request.httpHeadersOverwriteParam = '$httpHeaders';

    const url = urlParts.join('');
    console.log('Creating WebChannel: ' + url, request);
    const channel = webchannelTransport.createWebChannel(url, request);

    // WebChannel supports sending the first message with the handshake - saving
    // a network round trip. However, it will have to call send in the same
    // JS event loop as open. In order to enforce this, we delay actually
    // opening the WebChannel until send is called. Whether we have called
    // open is tracked with this variable.
    let opened = false;

    // A flag to determine whether the stream was closed (by us or through an
    // error/close event) to avoid delivering multiple close events or sending
    // on a closed stream
    let closed = false;

    const streamBridge = new StreamBridge<Req, Resp>({
      sendFn: (msg: Req) => {
        if (!closed) {
          if (!opened) {
            console.log('Opening WebChannel transport.');
            channel.open();
            opened = true;
          }
          console.log('WebChannel sending:', msg);
          channel.send(msg);
        } else {
          console.log('Not sending because WebChannel is closed:', msg);
        }
      },
      closeFn: () => channel.close()
    });

    // Closure events are guarded and exceptions are swallowed, so catch any
    // exception and rethrow using a setTimeout so they become visible again.
    // Note that eventually this function could go away if we are confident
    // enough the code is exception free.
    const unguardedEventListen = <T>(
        target: EventTarget,
        type: string | number,
        fn: (param: T) => void
    ): void => {
      // TODO(dimond): closure typing seems broken because WebChannel does
      // not implement goog.events.Listenable
      target.listen(type, (param: unknown) => {
        try {
          fn(param as T);
        } catch (e) {
          setTimeout(() => {
            throw e;
          }, 0);
        }
      });
    };

    unguardedEventListen(channel, WebChannel.EventType.OPEN, () => {
      if (!closed) {
        console.log('WebChannel transport opened.');
      }
    });

    unguardedEventListen(channel, WebChannel.EventType.CLOSE, () => {
      if (!closed) {
        closed = true;
        console.log('WebChannel transport closed');
        streamBridge.callOnClose();
      }
    });

    unguardedEventListen<Error>(channel, WebChannel.EventType.ERROR, err => {
      if (!closed) {
        closed = true;
        console.log('WebChannel transport errored:', err);
        streamBridge.callOnClose(
            new Error(
                'The operation could not be completed'
            )
        );
      }
    });

    // WebChannel delivers message events as array. If batching is not enabled
    // (it's off by default) each message will be delivered alone, resulting in
    // a single element array.
    interface WebChannelResponse {
      data: Resp[];
    }

    unguardedEventListen<WebChannelResponse>(
        channel,
        WebChannel.EventType.MESSAGE,
        msg => {
          if (!closed) {
            const msgData = msg.data[0];
            // TODO(b/35143891): There is a bug in One Platform that caused errors
            // (and only errors) to be wrapped in an extra array. To be forward
            // compatible with the bug we need to check either condition. The latter
            // can be removed once the fix has been rolled out.
            // Use any because msgData.error is not typed.
            const msgDataOrError: WebChannelError | object = msgData;
            const error =
                msgDataOrError.error ||
                (msgDataOrError as WebChannelError[])[0]?.error;
            if (error) {
              console.log('WebChannel received error:', error);
              let message = error.message;
              // Mark closed so no further events are propagated
              closed = true;
              streamBridge.callOnClose(new Error(message));
              channel.close();
            } else {
              // @ts-ignore
              if(msgData.targetChange) {
                // @ts-ignore
                console.log('WebChannel target change:', JSON.stringify(msgData.targetChange));
              } else  {
                // @ts-ignore
                console.log('WebChannel received:', msgData.documentChange.document.name);
              }
              streamBridge.callOnMessage(msgData);
            }
          }
        }
    );

    unguardedEventListen<StatEvent>(requestStats, Event.STAT_EVENT, event => {
      if (event.stat === Stat.PROXY) {
        console.log('Detected buffering proxy');
      } else if (event.stat === Stat.NOPROXY) {
        console.log('Detected no buffering proxy');
      }
    });

    setTimeout(() => {
      // Technically we could/should wait for the WebChannel opened event,
      // but because we want to send the first message with the WebChannel
      // handshake we pretend the channel opened here (asynchronously), and
      // then delay the actual open until the first message is sent.
      streamBridge.callOnOpen();
    }, 0);
    return streamBridge;
  }

  /**
   * Modifies the headers for a request, adding any authorization token if
   * present and any additional headers for the request.
   */
  private modifyHeadersForRequest(
      headers: StringMap,
  ): void {
    headers['X-Goog-Api-Client'] = this.getGoogApiClientValue();

    // Content-Type: text/plain will avoid preflight requests which might
    // mess with CORS and redirects by proxies. If we add custom headers
    // we will need to change this code to potentially use the $httpOverwrite
    // parameter supported by ESF to avoid triggering preflight requests.
    headers['Content-Type'] = 'text/plain';
  }

  private getGoogApiClientValue(): string {
    return 'gl-js/ fire/' + 'testing';
  }
}
