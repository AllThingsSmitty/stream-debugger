export const version = '0.1.0';

// .stream format types and utilities
export { STREAM_FORMAT_VERSION } from './types/stream';
export type {
  StreamDocument,
  StreamMetadata,
  StreamEvent,
  StreamSummary,
  WaterfallData,
  TimelineSegment,
  Keyframe,
  RequestContext,
  ResponseContext,
  ProviderEvent,
} from './types/stream';

export { StreamBuilder, serializeStream, deserializeStream } from './stream-builder';
