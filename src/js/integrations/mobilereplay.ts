import type { Client, DynamicSamplingContext, Event, IntegrationFn, IntegrationFnResult } from '@sentry/types';
import { logger } from '@sentry/utils';

import { isHardCrash } from '../misc';
import { hasHooks } from '../utils/clientutils';
import { isExpoGo, notMobileOs } from '../utils/environment';
import { NATIVE } from '../wrapper';

const NAME = 'MobileReplay';

/**
 * MobileReplay Integration let's you change default options.
 */
export const mobileReplayIntegration: IntegrationFn = () => {
  if (isExpoGo()) {
    logger.warn(`[Sentry] ${NAME} is not supported in Expo Go. Use EAS Build or \`expo prebuild\` to enable it.`);
  }
  if (notMobileOs()) {
    logger.warn(`[Sentry] ${NAME} is not supported on this platform.`);
  }

  if (isExpoGo() || notMobileOs()) {
    return mobileReplayIntegrationNoop();
  }

  async function processEvent(event: Event): Promise<Event> {
    if (!event.exception) {
      // Event is not an error, will not capture replay
      return event;
    }

    const recordingReplayId = NATIVE.getCurrentReplayId();
    if (recordingReplayId) {
      logger.debug(`[Sentry] ${NAME} assign already recording replay ${recordingReplayId} for event ${event.event_id}.`);
      return event;
    }

    const replayId = await NATIVE.startReplay(isHardCrash(event));
    if (!replayId) {
      logger.debug(`[Sentry] ${NAME} not sampled for event ${event.event_id}.`);
    }

    return event;
  }

  function setup(client: Client): void {
    if (!hasHooks(client)) {
      return;
    }

    client.on('createDsc', (dsc: DynamicSamplingContext) => {
      // TODO: For better performance, we should emit replayId changes on native, and hold the replayId value in JS
      const currentReplayId = NATIVE.getCurrentReplayId();
      if (currentReplayId) {
        dsc.replay_id = currentReplayId;
      }
    });
  }

  // TODO: When adding manual API, ensure overlap with the web replay so users can use the same API interchangeably
  // https://github.com/getsentry/sentry-javascript/blob/develop/packages/replay-internal/src/integration.ts#L45
  return {
    name: NAME,
    setupOnce() { /* Noop */ },
    setup,
    processEvent,
  };
};

function mobileReplayIntegrationNoop(): IntegrationFnResult {
  return {
    name: NAME,
    setupOnce() { /* Noop */ },
  };
}
