<?php

namespace SVHQ_SVI\Store;

use SVHQ_SVI\UI\ThemeOptionsTab;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Every import this site has run, in one non-autoloaded option row.
 *
 * Deliberately site level rather than module or post meta: the point of the history is to reimport
 * into a DIFFERENT slider, or after the original module was deleted, so it cannot live with the
 * module it happened to be run from.
 */
final class History
{
    public const OPTION = 'svhq_svi_history';

    /** Older entries are dropped past this, so the row cannot grow without bound. */
    private const MAX_ENTRIES = 30;

    /** And each entry keeps at most this many videos, for the same reason. */
    private const MAX_VIDEOS = 200;

    /** @return array<int, array> Newest first. */
    public static function all(): array
    {
        $saved = get_option(self::OPTION, []);

        return is_array($saved) ? array_values($saved) : [];
    }

    /**
     * Records one import and returns the stored list.
     *
     * @param array $entry {source, label, videos}.
     * @return array<int, array> The list, newest first.
     */
    public static function add(array $entry): array
    {
        // Gated on the Theme Options checkbox. Entries already stored are left alone: turning the
        // setting off stops new records, it does not erase what is there.
        if (!ThemeOptionsTab::history_enabled()) {
            return self::all();
        }

        $videos = [];

        foreach (array_slice((array)($entry['videos'] ?? []), 0, self::MAX_VIDEOS) as $video) {
            $url = esc_url_raw((string)($video['url'] ?? ''));

            if ('' === $url) {
                continue;
            }

            $videos[] = [
                'url' => $url,
                'key' => sanitize_text_field((string)($video['key'] ?? '')),
                'provider' => sanitize_key((string)($video['provider'] ?? '')),
                'title' => sanitize_text_field((string)($video['title'] ?? '')),
                'thumbnail' => esc_url_raw((string)($video['thumbnail'] ?? '')),
                'duration' => sanitize_text_field((string)($video['duration'] ?? '')),
                'views' => sanitize_text_field((string)($video['views'] ?? '')),
            ];
        }

        if (empty($videos)) {
            return self::all();
        }

        $list = self::all();

        array_unshift(
            $list,
            [
                'id' => wp_generate_uuid4(),
                'source' => 'playlist' === ($entry['source'] ?? '') ? 'playlist' : 'urls',
                'label' => sanitize_text_field((string)($entry['label'] ?? '')),
                'count' => count($videos),
                'time' => time(),
                'user' => get_current_user_id(),
                'videos' => $videos,
            ]
        );

        $list = array_slice($list, 0, self::MAX_ENTRIES);

        update_option(self::OPTION, $list, false);

        return $list;
    }

    /** Removes one entry by id and returns what is left. */
    public static function remove(string $id): array
    {
        $list = array_values(
            array_filter(
                self::all(),
                static function ($entry) use ($id) {
                    return ($entry['id'] ?? '') !== $id;
                }
            )
        );

        update_option(self::OPTION, $list, false);

        return $list;
    }

    public static function clear(): array
    {
        update_option(self::OPTION, [], false);

        return [];
    }
}
