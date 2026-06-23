/**
 * Image hash utilities have been removed.
 *
 * The expo-crypto SHA-256 hashing step was reading entire image files into
 * memory, which caused OOM crashes on device. The upload pipeline now sends
 * the raw image directly via a standard S3 presigned PUT URL — no client-side
 * checksum is required.
 */
