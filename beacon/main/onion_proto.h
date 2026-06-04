/**
 * onion_proto.h — ONION RPG ESP-NOW wire protocol (C implementation).
 *
 * Mirrors src/lib/shared/protocol.ts EXACTLY. Any change to the byte layout
 * MUST be reflected in both files and in the Lua client (oRPG/lib/net.lua).
 *
 * Frame layout (binary header + body bytes, total <= 240):
 *   byte 0   MAGIC   = 0x4F ('O')
 *   byte 1   VERSION = 0x01
 *   byte 2   type    (MsgType)
 *   byte 3   flags   (bit0 = more-chunks-follow)
 *   byte 4-5 msgId   (uint16 big-endian)
 *   byte 6   seq     (uint8)  chunk index, 0-based
 *   byte 7   total   (uint8)  total chunk count (>= 1)
 *   byte 8.. body    (<= 232 bytes UTF-8 JSON)
 */
#pragma once

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Constants ─────────────────────────────────────────────────────────── */

#define ONION_PROTO_MAGIC          0x4F
#define ONION_PROTO_VERSION        0x01
#define ONION_ESPNOW_MAX_FRAME     240
#define ONION_PROTO_HEADER_SIZE    8
#define ONION_PROTO_MAX_BODY       (ONION_ESPNOW_MAX_FRAME - ONION_PROTO_HEADER_SIZE) /* 232 */
#define ONION_PROTO_FLAG_MORE      0x01

/* ── Message types (stable wire constants — never renumber, append only) ─ */

typedef enum {
    /* discovery / identity */
    MSG_BEACON_HELLO        = 0x01,
    MSG_OPERATIVE_IDENTIFY  = 0x02,
    MSG_IDENTIFY_ACK        = 0x03,

    /* challenge lifecycle */
    MSG_CHALLENGE_BEGIN     = 0x10,
    MSG_CHALLENGE_INTRO     = 0x11,
    MSG_CHALLENGE_RESULT    = 0x12,

    /* combat (secure-element RNG) */
    MSG_COMBAT_ROLL_REQUEST  = 0x20,
    MSG_COMBAT_ROLL_RESPONSE = 0x21,

    /* dialogue (voice) */
    MSG_VOICE_CAPTURE_SUBMIT = 0x30,
    MSG_VOICE_RESULT         = 0x31,

    /* merchant (buttons) */
    MSG_MERCHANT_INPUT       = 0x40,
    MSG_MERCHANT_RESULT      = 0x41,

    /* npc (AI) */
    MSG_NPC_DIALOGUE_TURN    = 0x50,
    MSG_NPC_DIALOGUE_REPLY   = 0x51,

    /* rewards / state */
    MSG_REWARD_GRANT         = 0x60,
    MSG_PROGRESSION_STATE    = 0x61,

    /* transport control */
    MSG_ACK                  = 0x70,
    MSG_ERROR                = 0x71,
} onion_msg_type_t;

/* ── Frame struct ─────────────────────────────────────────────────────── */

typedef struct {
    onion_msg_type_t type;
    uint16_t         msg_id;
    uint8_t          seq;
    uint8_t          total;
    bool             more;
    const uint8_t   *body;
    size_t           body_len;
} onion_frame_t;

/* ── Encoder ──────────────────────────────────────────────────────────── */

/**
 * Encode one frame into `out_buf` (must be >= ONION_ESPNOW_MAX_FRAME bytes).
 * Returns total bytes written, or 0 on error.
 *
 * Usage:
 *   char frames[N][240];
 *   size_t n_frames;
 *   onion_encode_chunks(MSG_CHALLENGE_BEGIN, msg_id,
 *                       json_str, json_len,
 *                       frames, &n_frames, N);
 */
size_t onion_encode_frame(
    uint8_t         *out_buf,
    onion_msg_type_t type,
    uint16_t         msg_id,
    uint8_t          seq,
    uint8_t          total,
    const uint8_t   *body,
    size_t           body_len);

/**
 * Split `body_json` (UTF-8) into <= 232-byte chunks and write each frame into
 * `frames[i]`. Caller must supply `max_frames` worth of 240-byte buffers.
 * Returns the number of frames written, or 0 on error (e.g. too large).
 */
int onion_encode_chunks(
    onion_msg_type_t  type,
    uint16_t          msg_id,
    const char       *body_json,
    size_t            body_len,
    uint8_t           frames[][ONION_ESPNOW_MAX_FRAME],
    size_t           *out_frame_sizes,
    int               max_frames);

/* ── Decoder ──────────────────────────────────────────────────────────── */

/**
 * Decode one raw ESP-NOW frame. Returns true on success, false on bad header.
 * `frame->body` points into `raw` (no copy); lifetime tied to `raw`.
 */
bool onion_decode_frame(const uint8_t *raw, size_t raw_len, onion_frame_t *frame);

/* ── Reassembler ─────────────────────────────────────────────────────── */

/* Maximum total bytes of a reassembled message (NPC replies can be long). */
#define ONION_REASSEMBLER_MAX_BODY 4096
#define ONION_REASSEMBLER_MAX_CHUNKS 32

typedef struct {
    uint16_t              msg_id;
    onion_msg_type_t      type;
    uint8_t               total;
    uint8_t               received;
    /* one slot per chunk index */
    uint8_t  chunk_data[ONION_REASSEMBLER_MAX_CHUNKS][ONION_PROTO_MAX_BODY];
    size_t   chunk_len[ONION_REASSEMBLER_MAX_CHUNKS];
    bool     chunk_present[ONION_REASSEMBLER_MAX_CHUNKS];
    /* assembled body written here when complete */
    char     assembled[ONION_REASSEMBLER_MAX_BODY + 1];
    size_t   assembled_len;
} onion_reassembler_t;

/** Reset reassembler to initial state. */
void onion_reassembler_reset(onion_reassembler_t *r);

/**
 * Feed one frame. Returns true when all chunks have been received and the
 * body has been copied into r->assembled (null-terminated). Returns false
 * while still waiting for more chunks.
 */
bool onion_reassembler_push(onion_reassembler_t *r, const onion_frame_t *frame);

#ifdef __cplusplus
}
#endif
