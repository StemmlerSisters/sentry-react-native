import type { BaseTransportOptions, Client, ClientOptions, Event, EventHint, Integration } from '@sentry/types';

import { NATIVE } from '../wrapper';

/** Release integration responsible to load release from file. */
export class Release implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Release';
  /**
   * @inheritDoc
   */
  public name: string = Release.id;

  /**
   * @inheritDoc
   * @deprecated
   */
  public setupOnce(): void {
    // nothing to do here
  }

  /**
   * @inheritDoc
   */
  public async processEvent(event: Event, _: EventHint, client: Client<ClientOptions<BaseTransportOptions>>): Promise<Event> {
    const options = client.getOptions();

    /*
      __sentry_release and __sentry_dist is set by the user with setRelease and setDist. If this is used then this is the strongest.
      Otherwise we check for the release and dist in the options passed on init, as this is stronger than the release/dist from the native build.
    */
    if (typeof event.extra?.__sentry_release === 'string') {
      event.release = `${event.extra.__sentry_release}`;
    } else if (typeof options?.release === 'string') {
      event.release = options.release;
    }

    if (typeof event.extra?.__sentry_dist === 'string') {
      event.dist = `${event.extra.__sentry_dist}`;
    } else if (typeof options?.dist === 'string') {
      event.dist = options.dist;
    }

    if (event.release && event.dist) {
      return event;
    }

    try {
      const nativeRelease = await NATIVE.fetchNativeRelease();
      if (nativeRelease) {
        if (!event.release) {
          event.release = `${nativeRelease.id}@${nativeRelease.version}+${nativeRelease.build}`;
        }
        if (!event.dist) {
          event.dist = `${nativeRelease.build}`;
        }
      }
    } catch (_Oo) {
      // Something went wrong, we just continue
    }

    return event;
  }
}
