/**
 * onion_proto.c — ONION RPG ESP-NOW wire protocol implementation.
 *
 * Implements the frame encoder/decoder and reassembler declared in
 * onion_proto.h. Logic mirrors src/lib/shared/protocol.ts exactly.
 */

#include "onion_proto.h"
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"

static const char *TAG = "proto";

/* ── Encoder ──────────────────────────────────────────────────────────── */

size_t onion_encode_frame(
    uint8_t         *out_buf,
    onion_msg_type_t type,
    uint16_t         msg_id,
    uint8_t          seq,
    uint8_t          total,
    const uint8_t   *body,
    size_t           body_len)
{
    if (!out_buf || body_len > ONION_PROTO_MAX_BODY) return 0;

    bool more = (seq < (total - 1));

    out_buf[0] = ONION_PROTO_MAGIC;
    out_buf[1] = ONION_PROTO_VERSION;
    out_buf[2] = (uint8_t)type;
    out_buf[3] = more ? ONION_PROTO_FLAG_MORE : 0x00;
    out_buf[4] = (uint8_t)((msg_id >> 8) & 0xff);
    out_buf[5] = (uint8_t)(msg_id & 0xff);
    out_buf[6] = seq;
    out_buf[7] = total;

    if (body && body_len > 0) {
        memcpy(out_buf + ONION_PROTO_HEADER_SIZE, body, body_len);
    }

    return ONION_PROTO_HEADER_SIZE + body_len;
}

int onion_encode_chunks(
    onion_msg_type_t  type,
    uint16_t          msg_id,
    const char       *body_json,
    size_t            body_len,
    uint8_t           frames[][ONION_ESPNOW_MAX_FRAME],
    size_t           *out_frame_sizes,
    int               max_frames)
{
    /* Empty body encodes as a single frame with no body bytes. */
    int total = (body_len == 0) ? 1
              : (int)((body_len + ONION_PROTO_MAX_BODY - 1) / ONION_PROTO_MAX_BODY);

    if (total > max_frames || total > 255) {
        ESP_LOGW(TAG, "message too large: %zu bytes / %d chunks", body_len, total);
        return 0;
    }

    for (int seq = 0; seq < total; seq++) {
        size_t offset   = (size_t)seq * ONION_PROTO_MAX_BODY;
        size_t chunk_sz = (body_len > offset)
                        ? ((body_len - offset) < ONION_PROTO_MAX_BODY
                                ? (body_len - offset)
                                : ONION_PROTO_MAX_BODY)
                        : 0;

        const uint8_t *chunk_ptr = (body_json && chunk_sz > 0)
                                 ? (const uint8_t *)(body_json + offset)
                                 : NULL;

        size_t written = onion_encode_frame(
            frames[seq], type, msg_id,
            (uint8_t)seq, (uint8_t)total,
            chunk_ptr, chunk_sz);

        if (written == 0) return 0;
        out_frame_sizes[seq] = written;
    }

    return total;
}

/* ── Decoder ──────────────────────────────────────────────────────────── */

bool onion_decode_frame(const uint8_t *raw, size_t raw_len, onion_frame_t *frame) {
    if (!raw || !frame || raw_len < ONION_PROTO_HEADER_SIZE) {
        return false;
    }
    if (raw[0] != ONION_PROTO_MAGIC) {
        ESP_LOGD(TAG, "bad magic 0x%02X", raw[0]);
        return false;
    }
    if (raw[1] != ONION_PROTO_VERSION) {
        ESP_LOGD(TAG, "unsupported version 0x%02X", raw[1]);
        return false;
    }

    frame->type     = (onion_msg_type_t)raw[2];
    frame->more     = (raw[3] & ONION_PROTO_FLAG_MORE) != 0;
    frame->msg_id   = ((uint16_t)raw[4] << 8) | raw[5];
    frame->seq      = raw[6];
    frame->total    = raw[7];
    frame->body     = raw + ONION_PROTO_HEADER_SIZE;
    frame->body_len = raw_len - ONION_PROTO_HEADER_SIZE;

    return true;
}

/* ── Reassembler ─────────────────────────────────────────────────────── */

void onion_reassembler_reset(onion_reassembler_t *r) {
    memset(r, 0, sizeof(*r));
}

bool onion_reassembler_push(onion_reassembler_t *r, const onion_frame_t *frame) {
    if (!r || !frame) return false;

    /* If the msg_id changed, reset and start fresh. */
    if (r->received > 0 && r->msg_id != frame->msg_id) {
        ESP_LOGD(TAG, "new msgId %u (was %u); resetting reassembler",
                 frame->msg_id, r->msg_id);
        onion_reassembler_reset(r);
    }

    r->msg_id = frame->msg_id;
    r->type   = frame->type;
    r->total  = frame->total;

    uint8_t seq = frame->seq;
    if (seq >= ONION_REASSEMBLER_MAX_CHUNKS) {
        ESP_LOGW(TAG, "seq %u out of range (max %d)", seq, ONION_REASSEMBLER_MAX_CHUNKS);
        return false;
    }
    if (frame->body_len > ONION_PROTO_MAX_BODY) {
        ESP_LOGW(TAG, "chunk body %zu too large", frame->body_len);
        return false;
    }

    if (!r->chunk_present[seq]) {
        memcpy(r->chunk_data[seq], frame->body, frame->body_len);
        r->chunk_len[seq] = frame->body_len;
        r->chunk_present[seq] = true;
        r->received++;
    }

    if (r->received < r->total) return false;

    /* All chunks present — concatenate in seq order. */
    size_t offset = 0;
    for (uint8_t i = 0; i < r->total; i++) {
        if (!r->chunk_present[i]) {
            ESP_LOGW(TAG, "gap at seq %u; reassembly incomplete", i);
            return false;
        }
        size_t avail = ONION_REASSEMBLER_MAX_BODY - offset;
        size_t copy  = (r->chunk_len[i] < avail) ? r->chunk_len[i] : avail;
        memcpy(r->assembled + offset, r->chunk_data[i], copy);
        offset += copy;
    }
    r->assembled[offset] = '\0';
    r->assembled_len = offset;

    return true;
}
