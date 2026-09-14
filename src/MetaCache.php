<?php

namespace SVHQ_SVI;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Remembers what a video's title, thumbnail, duration and view count were.
 *
 * Re-importing the same playlist, or pasting a URL a second time, otherwise re-fetches metadata
 * that has not changed. Cached per video key, so a hit costs no outbound request at all.
 */
final class MetaCache
{
    public const PREFIX = 'svhq_svi_meta_';

    private const TTL = 12 * HOUR_IN_SECONDS;

    /** @return array<string, array> Cached entries, keyed by the video key that was asked for. */
    public static function get_many(array $keys): array
    {
        $found = [];

        foreach ($keys as $key) {
            $cached = get_transient(self::PREFIX.md5($key));

            if (is_array($cached)) {
                $found[$key] = $cached;
            }
        }

        return $found;
    }

    public static function put(string $key, array $meta): void
    {
        set_transient(self::PREFIX.md5($key), $meta, self::TTL);
    }
}
