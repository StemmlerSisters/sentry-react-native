import type { FrameId, StackId, ThreadCpuFrame,ThreadCpuSample, ThreadCpuStack, ThreadId } from '@sentry/types';
import { logger } from '@sentry/utils';

import type * as Hermes from './hermes';
import { parseHermesStackFrameName } from './hermes';
import type { RawThreadCpuProfile } from './types';

const ANONYMOUS_FUNCTION_NAME = 'anonymous';
const UNKNOWN_STACK_ID = -1;
const JS_THREAD_NAME = 'JavaScriptThread';
const JS_THREAD_PRIORITY = 1;

/**
 * Converts a Hermes profile to a Sentry profile.
 *
 * Maps Hermes samples to Sentry samples.
 * Maps Hermes stack frames to Sentry frames.
 * Hermes stack frame is an object representing a function call in the stack
 * with a link to its parent stack frame. Root of the represented stack tree
 * is main function call in Hermes that is [root] stack frame.
 *
 * @returns Sentry profile or null if no samples are found.
 */
export function convertToSentryProfile(hermesProfile: Hermes.Profile): RawThreadCpuProfile | null {
  if (hermesProfile.samples.length === 0) {
    logger.warn('[Profiling] No samples found in profile.');
    return null;
  }

  const { samples, hermesStacks, jsThreads } = mapSamples(hermesProfile.samples);

  const { frames, hermesStackFrameIdToSentryFrameIdMap } = mapFrames(hermesProfile.stackFrames);

  const { stacks, hermesStackToSentryStackMap } = mapStacks(
    hermesStacks,
    hermesProfile.stackFrames,
    hermesStackFrameIdToSentryFrameIdMap,
);

  for (const sample of samples) {
    sample.stack_id = hermesStackToSentryStackMap.get(sample.stack_id) ?? UNKNOWN_STACK_ID;
  }

  const thread_metadata: Record<ThreadId, { name?: string; priority?: number }> = {};
  for (const jsThreadId of jsThreads) {
    thread_metadata[jsThreadId] = {
      name: JS_THREAD_NAME,
      priority: JS_THREAD_PRIORITY,
    };
  }

  return {
    samples,
    frames,
    stacks,
    thread_metadata,
  };
}

/**
 * Maps Hermes samples to Sentry samples.
 * Calculates the elapsed time since the first sample based on the absolute timestamps of the Hermes samples.
 * Hermes stack frame IDs represent the last (leaf, furthest from the main func) frame of the call stack.
 * @returns the mapped Sentry samples, the set of Hermes stack frame IDs, and the set of JS thread IDs
 */
function mapSamples(hermesSamples: Hermes.Sample[]): {
  samples: ThreadCpuSample[];
  hermesStacks: Set<Hermes.StackFrameId>;
  jsThreads: Set<ThreadId>;
} {
  const jsThreads = new Set<ThreadId>();
  const hermesStacks = new Set<Hermes.StackFrameId>();

  const start = Number(hermesSamples[0].ts);
  const samples = hermesSamples.map((hermesSample: Hermes.Sample): ThreadCpuSample => {
    jsThreads.add(hermesSample.tid);
    hermesStacks.add(hermesSample.sf);

    const elapsed_since_start_ns = (Number(hermesSample.ts) - start) * 1e3;

    return {
      stack_id: hermesSample.sf,
      thread_id: hermesSample.tid,
      elapsed_since_start_ns: elapsed_since_start_ns.toFixed(0),
    };
  });

  return {
    samples,
    hermesStacks,
    jsThreads,
  };
};

/**
 * Maps Hermes StackFrames tree represented as an JS object to a Sentry frames array.
 * Converts line and columns strings to numbers.
 * @returns the mapped Sentry frames
 */
function mapFrames(hermesStackFrames: Record<Hermes.StackFrameId, Hermes.StackFrame>): {
  frames: ThreadCpuFrame[];
  hermesStackFrameIdToSentryFrameIdMap: Map<Hermes.StackFrameId, FrameId>;
} {
  const frames: ThreadCpuFrame[] = [];
  const hermesStackFrameIdToSentryFrameIdMap = new Map<Hermes.StackFrameId, FrameId>();
  for (const key in hermesStackFrames) { // asc order based on the key is not guaranteed
    if (!Object.prototype.hasOwnProperty.call(hermesStackFrames, key)) {
      continue;
    }
    hermesStackFrameIdToSentryFrameIdMap.set(Number(key), frames.length);
    const hermesFrame = hermesStackFrames[key];

    const stackFrameName = parseHermesStackFrameName(hermesFrame.name);
    frames.push({
      function: stackFrameName.function || ANONYMOUS_FUNCTION_NAME,
      file: stackFrameName.fileName,
      line: hermesFrame.line !== undefined ? Number(hermesFrame.line) : undefined,
      column: hermesFrame.column !== undefined ? Number(hermesFrame.column) : undefined,
    });
  }

  return {
    frames,
    hermesStackFrameIdToSentryFrameIdMap,
  };
}

/**
 * Maps Hermes stack frame IDs to Sentry stack arrays.
 * Hermes stack frame IDs represent the last (leaf, furthest from the main func) frame of the call stack.
 * @returns the mapped Sentry stacks and a map from Hermes stack IDs to Sentry stack IDs (indices in the stacks array)
 */
function mapStacks(
  hermesStacks: Set<Hermes.StackFrameId>,
  hermesStackFrames: Record<Hermes.StackFrameId, Hermes.StackFrame>,
  hermesStackFrameIdToSentryFrameIdMap: Map<Hermes.StackFrameId, FrameId>,
): {
  stacks: ThreadCpuStack[];
  hermesStackToSentryStackMap: Map<Hermes.StackFrameId, StackId>;
} {
  const hermesStackToSentryStackMap = new Map<Hermes.StackFrameId, StackId>();
  const stacks: ThreadCpuStack[] = [];
  for (const hermesStackFunctionFrameId of hermesStacks) {
    const stackId = stacks.length;
    hermesStackToSentryStackMap.set(hermesStackFunctionFrameId, stackId);
    const stack: ThreadCpuStack = [];
    let currentHermesFrameId: Hermes.StackFrameId | undefined = hermesStackFunctionFrameId;
    while (currentHermesFrameId !== undefined) {
      const sentryFrameId = hermesStackFrameIdToSentryFrameIdMap.get(currentHermesFrameId);
      sentryFrameId !== undefined && stack.push(sentryFrameId);
      currentHermesFrameId = hermesStackFrames[currentHermesFrameId] && hermesStackFrames[currentHermesFrameId].parent;
    }
    stacks.push(stack);
  }

  return {
    stacks,
    hermesStackToSentryStackMap,
  };
}