/**
 * http_relay.h — HTTPS relay: POST base64 frames to /api/relay, return
 * response frames.
 *
 * Implements the server endpoint contract from CONTRACTS.md §4:
 *   POST /api/relay
 *   Body:  { "beaconId": "...", "frames": ["<base64>", ...] }
 *   Auth:  Authorization: Bearer <BEACON_API_KEY>
 *   Resp:  { "frames": ["<base64>", ...] }
 */
#pragma once

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Send one or more raw ESP-NOW frames to the game server's /api/relay endpoint
 * and return the response frames.
 *
 * @param in_frames     Array of raw frame buffers (each <= 240 bytes).
 * @param in_sizes      Byte length of each frame.
 * @param in_count      Number of frames in in_frames.
 * @param out_frames    Output: caller-supplied array of 240-byte buffers.
 * @param out_sizes     Output: byte length of each returned frame.
 * @param out_max       Maximum number of output frames the caller can accept.
 * @param out_count     Output: number of frames actually returned.
 * @return 0 on success, non-zero on HTTP/parse error.
 */
int http_relay(
    const uint8_t  in_frames[][240],
    const size_t   in_sizes[],
    int            in_count,
    uint8_t        out_frames[][240],
    size_t         out_sizes[],
    int            out_max,
    int           *out_count);

/**
 * Voice audio out-of-band upload.
 * Uploads a raw audio blob (WAV/PCM) to POST /api/voice and writes the
 * server-returned opaque ref string into ref_out (null-terminated, max
 * ref_out_len bytes). Returns 0 on success.
 *
 * This endpoint is referenced in CONTRACTS.md §3 (audio does NOT travel
 * over ESP-NOW; beacon uploads out-of-band and passes a ref handle).
 */
int http_upload_voice(
    const uint8_t *audio_data,
    size_t         audio_len,
    char          *ref_out,
    size_t         ref_out_len);

#ifdef __cplusplus
}
#endif
