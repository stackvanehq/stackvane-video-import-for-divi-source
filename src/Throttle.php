<?php

namespace SVHQ_SVI;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * A per-user ceiling on import requests.
 *
 * The batch cap bounds one request. This bounds how many requests one account may make, so a
 * scripted caller cannot spend the site's YouTube quota by sending small batches in a loop.
 */
final class Throttle
{
    public const PREFIX = 'svhq_svi_rate_';

    private const MAX_PER_WINDOW = 20;

    private const WINDOW_SECONDS = 60;

    /** True when the caller is still inside its allowance, false when it has spent it. */
    public static function allow(int $user_id): bool
    {
        if ($user_id <= 0) {
            return false;
        }

        $key = self::PREFIX.$user_id;
        $used = (int)get_transient($key);

        if ($used >= self::MAX_PER_WINDOW) {
            return false;
        }

        // Re-setting the transient each time would slide the window forever under steady load, so
        // the expiry is only established on the first request of a window.
        set_transient($key, $used + 1, 0 === $used ? self::WINDOW_SECONDS : self::remaining($key));

        return true;
    }

    private static function remaining(string $key): int
    {
        $timeout = (int)get_option('_transient_timeout_'.$key, 0);
        $left = $timeout - time();

        return $left > 0 ? $left : self::WINDOW_SECONDS;
    }
}
