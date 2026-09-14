<?php

namespace SVHQ_SVI\Rest;

use SVHQ_SVI\Kernel;
use SVHQ_SVI\MetaCache;
use SVHQ_SVI\Throttle;
use SVHQ_SVI\UI\ThemeOptionsTab;
use WpOrg\Requests\Requests;
use WP_REST_Request;
use WP_REST_Response;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Turns pasted video URLs, or one playlist URL, into the data a Video Slider slide needs.
 */
class ImportController extends Controller
{
    private const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];

    private const VIMEO_HOSTS = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

    private const FILE_EXTENSIONS = ['mp4', 'webm', 'ogv', 'ogg', 'mov'];

    /** Each URL can cost an outbound request, so a batch is capped rather than unbounded. */
    private const MAX_URLS = 100;

    /** Playlist pagination ceiling: 8 pages of 50 is 400 videos. */
    private const MAX_PLAYLIST_PAGES = 8;

    private const YT_OEMBED = 'https://www.youtube.com/oembed';

    private const YT_API_VIDEOS = 'https://www.googleapis.com/youtube/v3/videos';

    private const YT_API_ITEMS = 'https://www.googleapis.com/youtube/v3/playlistItems';

    private const YT_FEED = 'https://www.youtube.com/feeds/videos.xml';

    private const VIMEO_OEMBED = 'https://vimeo.com/api/oembed.json';

    protected function routes(): array
    {
        return [
            [
                'path' => '/bulk-import',
                'methods' => 'POST',
                'callback' => [$this, 'bulk_import'],
                'permission' => [RestPolicy::class, 'import'],
                'args' => [
                    'urls' => [
                        'required' => true,
                        'type' => 'array',
                        'items' => ['type' => 'string'],
                        'validate_callback' => [self::class, 'validate_urls'],
                    ],
                    'mode' => self::mode_arg(),
                ],
            ],
            [
                'path' => '/playlist-import',
                'methods' => 'POST',
                'callback' => [$this, 'playlist_import'],
                'permission' => [RestPolicy::class, 'import'],
                'args' => [
                    'playlist' => [
                        'required' => true,
                        'type' => 'string',
                        'sanitize_callback' => [self::class, 'sanitize_string'],
                    ],
                    'mode' => self::mode_arg(),
                ],
            ],
        ];
    }

    private static function mode_arg(): array
    {
        return [
            'required' => false,
            'type' => 'string',
            'enum' => ['free', 'api'],
            'default' => 'free',
            'sanitize_callback' => [self::class, 'sanitize_string'],
        ];
    }

    /** Wrapped: WordPress hands a sanitize_callback ($value, $request, $param). */
    public static function sanitize_string($value): string
    {
        return sanitize_text_field((string)$value);
    }

    public static function validate_urls($value): bool
    {
        if (!is_array($value) || empty($value) || count($value) > self::MAX_URLS) {
            return false;
        }
        foreach ($value as $item) {
            if (!is_string($item)) {
                return false;
            }
        }

        return true;
    }

    private static function too_many_requests()
    {
        return self::fail(
            'svhq_svi_rate_limited',
            __('Too Many Imports In A Row. Wait A Moment And Try Again.', 'stackvane-video-import-for-divi'),
            429
        );
    }

    public function bulk_import(WP_REST_Request $request)
    {
        if (!Throttle::allow(get_current_user_id())) {
            return self::too_many_requests();
        }

        $mode = (string)$request->get_param('mode');
        $api_key = 'api' === $mode ? ThemeOptionsTab::api_key() : '';
        $entries = [];
        $seen = [];

        foreach ((array)$request->get_param('urls') as $index => $raw) {
            $url = esc_url_raw(trim((string)$raw));

            if ('' === $url) {
                continue;
            }

            $classified = self::classify($url);

            if (null === $classified) {
                $entries[] = [
                    'index' => $index,
                    'url' => $url,
                    'ok' => false,
                    'error' => __('Not A Recognised Video URL.', 'stackvane-video-import-for-divi'),
                ];
                continue;
            }

            $entry = array_merge(['index' => $index, 'url' => $url, 'ok' => true], $classified);

            if (isset($seen[$entry['key']])) {
                $entry['ok'] = false;
                $entry['error'] = __('Duplicate In The Pasted List.', 'stackvane-video-import-for-divi');
            } else {
                $seen[$entry['key']] = true;
            }

            $entries[] = $entry;
        }

        self::enrich($entries, $mode, $api_key);

        return new WP_REST_Response(['videos' => array_values($entries)], 200);
    }

    /**
     * Expands one YouTube playlist into videos, in the same shape bulk_import() returns so the
     * builder shares one preview, dedupe and insert path for both tabs.
     *
     * YouTube only: Vimeo's showcase API needs OAuth, and a self-hosted file is not a collection.
     */
    public function playlist_import(WP_REST_Request $request)
    {
        if (!Throttle::allow(get_current_user_id())) {
            return self::too_many_requests();
        }

        $playlist_id = self::extract_playlist_id((string)$request->get_param('playlist'));

        if ('' === $playlist_id) {
            return self::fail(
                'svhq_svi_bad_playlist',
                __('Enter A Valid YouTube Playlist URL Or ID.', 'stackvane-video-import-for-divi'),
                400
            );
        }

        $mode = (string)$request->get_param('mode');
        $api_key = 'api' === $mode ? ThemeOptionsTab::api_key() : '';
        $cache_key = 'playlist:'.$playlist_id.':'.('' !== $api_key ? 'api' : 'free');
        $cached = MetaCache::get_many([$cache_key]);

        if (isset($cached[$cache_key]['videos'])) {
            return new WP_REST_Response(['videos' => $cached[$cache_key]['videos']], 200);
        }

        $videos = '' !== $api_key
            ? self::fetch_playlist_via_api($playlist_id, $api_key)
            : self::fetch_playlist_via_feed($playlist_id);

        if (is_wp_error($videos)) {
            return $videos;
        }

        if (empty($videos)) {
            return self::fail(
                'svhq_svi_playlist_empty',
                __('No Videos Found In That Playlist.', 'stackvane-video-import-for-divi'),
                404
            );
        }

        $videos = array_values($videos);
        MetaCache::put($cache_key, ['videos' => $videos]);

        return new WP_REST_Response(['videos' => $videos], 200);
    }

    private static function extract_playlist_id(string $value): string
    {
        $value = trim($value);

        if ('' === $value) {
            return '';
        }
        if (preg_match('/[?&]list=([A-Za-z0-9_-]+)/', $value, $m)) {
            return $m[1];
        }

        return preg_match('/^[A-Za-z0-9_-]{10,}$/', $value) ? $value : '';
    }

    /** No API key: the public feed, which carries only the most recent videos and no metadata. */
    private static function fetch_playlist_via_feed(string $playlist_id)
    {
        $response = wp_safe_remote_get(
            self::YT_FEED.'?playlist_id='.rawurlencode($playlist_id),
            ['timeout' => 12, 'user-agent' => self::user_agent()]
        );

        if (is_wp_error($response)) {
            return self::fail(
                'svhq_svi_fetch_failed',
                __('Could Not Reach YouTube. Please Try Again.', 'stackvane-video-import-for-divi'),
                502
            );
        }

        $body = (string)wp_remote_retrieve_body($response);

        if (200 !== (int)wp_remote_retrieve_response_code($response) || '' === $body) {
            return self::fail(
                'svhq_svi_playlist_not_found',
                __('That Playlist Is Private Or Empty. Only Public Playlists Can Be Read Without An API Key.', 'stackvane-video-import-for-divi'),
                404
            );
        }

        return self::parse_youtube_feed($body);
    }

    /** LIBXML_NONET blocks network entity resolution, so a hostile feed cannot reach inward. */
    private static function parse_youtube_feed(string $xml): array
    {
        $previous = libxml_use_internal_errors(true);
        $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (false === $doc) {
            return [];
        }

        $videos = [];

        foreach ($doc->entry as $entry) {
            $yt = $entry->children('http://www.youtube.com/xml/schemas/2015');
            // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- External YouTube XML schema property.
            $video_id = isset($yt->videoId) ? sanitize_text_field((string)$yt->videoId) : '';
            $title = sanitize_text_field((string)$entry->title);

            if ('' === $video_id) {
                continue;
            }

            $videos[] = self::youtube_entry($video_id, $title, self::youtube_thumb($video_id));
        }

        return $videos;
    }

    /** The full playlist through the Data API, paginated, then enriched with duration and views. */
    private static function fetch_playlist_via_api(string $playlist_id, string $api_key)
    {
        $videos = [];
        $page_token = '';
        $pages = 0;

        do {
            $response = wp_safe_remote_get(
                add_query_arg(
                    [
                        'part' => 'snippet',
                        'maxResults' => 50,
                        'playlistId' => rawurlencode($playlist_id),
                        'key' => rawurlencode($api_key),
                        'pageToken' => $page_token,
                    ],
                    self::YT_API_ITEMS
                ),
                ['timeout' => 12, 'user-agent' => self::user_agent()]
            );

            if (is_wp_error($response)) {
                return self::fail(
                    'svhq_svi_fetch_failed',
                    __('Could Not Reach YouTube. Please Try Again.', 'stackvane-video-import-for-divi'),
                    502
                );
            }

            if (200 !== (int)wp_remote_retrieve_response_code($response)) {
                return self::fail(
                    'svhq_svi_api_error',
                    __('YouTube API Request Failed. Check The Playlist, And The API Key Under Theme Options.', 'stackvane-video-import-for-divi'),
                    400
                );
            }

            $data = json_decode((string)wp_remote_retrieve_body($response), true);

            foreach ((array)($data['items'] ?? []) as $item) {
                $snippet = $item['snippet'] ?? [];
                $video_id = isset($snippet['resourceId']['videoId'])
                    ? sanitize_text_field((string)$snippet['resourceId']['videoId'])
                    : '';
                $title = isset($snippet['title']) ? sanitize_text_field((string)$snippet['title']) : '';

                if ('' === $video_id || in_array($title, ['Private video', 'Deleted video'], true)) {
                    continue;
                }

                $thumbs = $snippet['thumbnails'] ?? [];
                $thumb = $thumbs['high']['url'] ?? $thumbs['default']['url'] ?? self::youtube_thumb($video_id);
                $videos[$video_id] = self::youtube_entry($video_id, $title, esc_url_raw((string)$thumb));
            }

            $page_token = isset($data['nextPageToken']) ? (string)$data['nextPageToken'] : '';
            ++$pages;
        } while ('' !== $page_token && $pages < self::MAX_PLAYLIST_PAGES);

        self::enrich_playlist_meta($videos, $api_key);

        return $videos;
    }

    private static function enrich_playlist_meta(array &$videos, string $api_key): void
    {
        if (empty($videos)) {
            return;
        }

        $requests = [];

        foreach (array_chunk(array_keys($videos), 50) as $chunk_index => $chunk) {
            $requests['chunk:'.$chunk_index] = self::api_request(
                ['part' => 'contentDetails,statistics', 'id' => rawurlencode(implode(',', $chunk)), 'maxResults' => 50],
                $api_key
            );
        }

        foreach (self::fetch_all($requests) as $response) {
            $data = self::decode($response);

            foreach ((array)($data['items'] ?? []) as $item) {
                $id = (string)($item['id'] ?? '');

                if ('' === $id || !isset($videos[$id])) {
                    continue;
                }

                $videos[$id]['duration'] = self::iso8601_to_clock((string)($item['contentDetails']['duration'] ?? ''));
                $videos[$id]['views'] = self::compact_count((int)($item['statistics']['viewCount'] ?? 0));
            }
        }
    }

    private static function youtube_entry(string $video_id, string $title, string $thumbnail): array
    {
        return [
            'provider' => 'youtube',
            'key' => 'youtube:'.$video_id,
            'url' => 'https://www.youtube.com/watch?v='.$video_id,
            'title' => '' !== $title ? $title : $video_id,
            'thumbnail' => $thumbnail,
            'ok' => true,
        ];
    }

    private static function youtube_thumb(string $video_id): string
    {
        return sprintf('https://i.ytimg.com/vi/%s/hqdefault.jpg', $video_id);
    }

    private static function api_request(array $args, string $api_key): array
    {
        return [
            'url' => add_query_arg(array_merge($args, ['key' => rawurlencode($api_key)]), self::YT_API_VIDEOS),
            'type' => 'GET',
        ];
    }

    /** Provider, stable identity for dedupe, and (for a file) the only title available. */
    private static function classify(string $url): ?array
    {
        $parts = wp_parse_url($url);
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = strtolower((string)($parts['host'] ?? ''));
        $path = (string)($parts['path'] ?? '');

        // esc_url_raw() still passes ftp, feed, telnet and more; a video src is http(s) only.
        if ('http' !== $scheme && 'https' !== $scheme) {
            return null;
        }

        if (in_array($host, self::YOUTUBE_HOSTS, true)) {
            $id = self::youtube_id($parts);

            return '' !== $id ? ['provider' => 'youtube', 'id' => $id, 'key' => 'youtube:'.$id] : null;
        }

        if (in_array($host, self::VIMEO_HOSTS, true)) {
            $id = self::vimeo_id($path);

            return '' !== $id ? ['provider' => 'vimeo', 'id' => $id, 'key' => 'vimeo:'.$id] : null;
        }

        $extension = strtolower((string)pathinfo($path, PATHINFO_EXTENSION));

        if (in_array($extension, self::FILE_EXTENSIONS, true)) {
            return [
                'provider' => 'self',
                'id' => '',
                'key' => 'self:'.strtolower($url),
                'title' => sanitize_text_field((string)pathinfo($path, PATHINFO_FILENAME)),
            ];
        }

        return null;
    }

    private static function youtube_id(array $parts): string
    {
        $host = strtolower((string)($parts['host'] ?? ''));
        $path = (string)($parts['path'] ?? '');

        if ('youtu.be' === $host) {
            $id = ltrim($path, '/');

            return preg_match('/^[A-Za-z0-9_-]{11}$/', $id) ? $id : '';
        }

        if (preg_match('#/(?:embed|shorts|v)/([A-Za-z0-9_-]{11})#', $path, $m)) {
            return $m[1];
        }

        parse_str((string)($parts['query'] ?? ''), $query);

        return isset($query['v']) && preg_match('/^[A-Za-z0-9_-]{11}$/', (string)$query['v'])
            ? (string)$query['v']
            : '';
    }

    private static function vimeo_id(string $path): string
    {
        return preg_match('#/(\d+)(?:/[a-z0-9]+)?/?$#i', $path, $m) ? $m[1] : '';
    }

    /**
     * Fills in title, thumbnail and (in API mode) duration and views. Anything already cached
     * costs no request; the rest are fetched in one batch. $entries is mutated in place.
     */
    private static function enrich(array &$entries, string $mode, string $api_key): void
    {
        $use_api = 'api' === $mode && '' !== $api_key;
        $wanted = [];

        foreach ($entries as $entry) {
            if (!empty($entry['ok']) && 'self' !== $entry['provider']) {
                $wanted[] = $entry['key'];
            }
        }

        $cached = MetaCache::get_many($wanted);
        $requests = [];
        $youtube_ids = [];

        foreach ($entries as $i => $entry) {
            if (empty($entry['ok']) || 'self' === $entry['provider'] || isset($cached[$entry['key']])) {
                continue;
            }

            if ('youtube' === $entry['provider']) {
                if ($use_api) {
                    $youtube_ids[$entry['id']] = true;
                    continue;
                }

                $requests['oembed:'.$i] = [
                    'url' => self::YT_OEMBED.'?format=json&url='.rawurlencode('https://www.youtube.com/watch?v='.$entry['id']),
                    'type' => 'GET',
                ];
            } elseif ('vimeo' === $entry['provider']) {
                $requests['oembed:'.$i] = [
                    'url' => self::VIMEO_OEMBED.'?url='.rawurlencode('https://vimeo.com/'.$entry['id']),
                    'type' => 'GET',
                ];
            }
        }

        foreach (array_chunk(array_keys($youtube_ids), 50) as $chunk_index => $chunk) {
            $requests['ytdata:'.$chunk_index] = self::api_request(
                [
                    'part' => 'snippet,contentDetails,statistics',
                    'id' => rawurlencode(implode(',', $chunk)),
                    'maxResults' => 50,
                ],
                $api_key
            );
        }

        $meta_by_id = [];

        foreach (self::fetch_all($requests) as $key => $response) {
            if (0 === strpos($key, 'oembed:')) {
                self::apply_oembed($entries[(int)substr($key, 7)], $response);
            } elseif (0 === strpos($key, 'ytdata:')) {
                self::collect_youtube_meta($meta_by_id, $response);
            }
        }

        foreach ($entries as &$entry) {
            if (empty($entry['ok']) || 'self' === $entry['provider']) {
                continue;
            }

            if (isset($cached[$entry['key']])) {
                $entry = array_merge($entry, $cached[$entry['key']]);
                continue;
            }

            if ('youtube' === $entry['provider'] && isset($meta_by_id[$entry['id']])) {
                $entry = array_merge($entry, $meta_by_id[$entry['id']]);
            }

            self::remember($entry);
        }
        unset($entry);

        self::apply_self_titles($entries);
    }

    /** Store only the fetched fields, never the per-request ones like index or ok. */
    private static function remember(array $entry): void
    {
        $meta = array_filter(
            [
                'title' => $entry['title'] ?? '',
                'thumbnail' => $entry['thumbnail'] ?? '',
                'duration' => $entry['duration'] ?? '',
                'views' => $entry['views'] ?? '',
            ],
            static function ($value) {
                return '' !== $value;
            }
        );

        if (!empty($meta) && !empty($entry['key'])) {
            MetaCache::put((string)$entry['key'], $meta);
        }
    }

    /**
     * Fetches a batch, concurrently where the platform allows it.
     *
     * WordPress ships the PSR-4 Requests class only from 6.2 (its own class-requests.php is
     * stamped @deprecated 6.2.0). This plugin supports 6.0, so the class is used only when it is
     * actually present and a sequential wp_safe_remote_get() loop covers the rest.
     *
     * Every URL here is built by this class from an ID it validated itself, against hardcoded
     * hosts, so no part of a request URL is caller-supplied.
     */
    private static function fetch_all(array $requests): array
    {
        if (empty($requests)) {
            return [];
        }

        if (class_exists(Requests::class)) {
            try {
                return Requests::request_multiple(
                    $requests,
                    ['timeout' => 10, 'connect_timeout' => 5, 'useragent' => self::user_agent()]
                );
            } catch (\Exception $e) {
                return [];
            }
        }

        $responses = [];

        foreach ($requests as $key => $request) {
            $response = wp_safe_remote_get(
                $request['url'],
                ['timeout' => 10, 'user-agent' => self::user_agent()]
            );

            $responses[$key] = (object)[
                'success' => !is_wp_error($response)
                    && 200 === (int)wp_remote_retrieve_response_code($response),
                'body' => is_wp_error($response) ? '' : (string)wp_remote_retrieve_body($response),
            ];
        }

        return $responses;
    }

    private static function user_agent(): string
    {
        return 'stackvane-video-import-for-divi/'.Kernel::VERSION;
    }

    /** @return array Decoded body, or an empty array for any failed or unreadable response. */
    private static function decode($response): array
    {
        if (!is_object($response) || empty($response->success)) {
            return [];
        }

        $data = json_decode((string)$response->body, true);

        return is_array($data) ? $data : [];
    }

    private static function apply_oembed(array &$entry, $response): void
    {
        $data = self::decode($response);

        if (!empty($data['title'])) {
            $entry['title'] = sanitize_text_field((string)$data['title']);
        }
        if (!empty($data['thumbnail_url'])) {
            $entry['thumbnail'] = esc_url_raw((string)$data['thumbnail_url']);
        }
        // Vimeo's oEmbed reports whole seconds; YouTube's reports none.
        if (!empty($data['duration']) && is_numeric($data['duration'])) {
            $entry['duration'] = self::seconds_to_clock((int)$data['duration']);
        }
    }

    private static function collect_youtube_meta(array &$meta_by_id, $response): void
    {
        foreach ((array)(self::decode($response)['items'] ?? []) as $item) {
            $id = (string)($item['id'] ?? '');

            if ('' === $id) {
                continue;
            }

            $title = isset($item['snippet']['title']) ? sanitize_text_field((string)$item['snippet']['title']) : '';
            $thumbs = $item['snippet']['thumbnails'] ?? [];
            $thumb = $thumbs['maxres']['url']
                ?? $thumbs['high']['url']
                ?? $thumbs['medium']['url']
                ?? $thumbs['default']['url']
                ?? '';

            $meta_by_id[$id] = [
                'title' => '' !== $title ? $title : $id,
                'thumbnail' => '' !== $thumb ? esc_url_raw((string)$thumb) : '',
                'duration' => self::iso8601_to_clock((string)($item['contentDetails']['duration'] ?? '')),
                'views' => self::compact_count((int)($item['statistics']['viewCount'] ?? 0)),
            ];
        }
    }

    /** A self-hosted file has no oEmbed to ask, so the filename is the only title there is. */
    private static function apply_self_titles(array &$entries): void
    {
        foreach ($entries as &$entry) {
            if (!empty($entry['ok']) && 'self' === $entry['provider'] && empty($entry['title'])) {
                $entry['title'] = __('Video', 'stackvane-video-import-for-divi');
            }
        }
        unset($entry);
    }

    private static function iso8601_to_clock(string $iso): string
    {
        if ('' === $iso) {
            return '';
        }

        try {
            $interval = new \DateInterval($iso);
        } catch (\Exception $e) {
            return '';
        }

        return self::seconds_to_clock(
            $interval->d * 86400 + $interval->h * 3600 + $interval->i * 60 + $interval->s
        );
    }

    private static function seconds_to_clock(int $total_seconds): string
    {
        $hours = intdiv($total_seconds, 3600);
        $minutes = intdiv($total_seconds % 3600, 60);
        $seconds = $total_seconds % 60;

        return $hours > 0
            ? sprintf('%d:%02d:%02d', $hours, $minutes, $seconds)
            : sprintf('%d:%02d', $minutes, $seconds);
    }

    private static function compact_count(int $count): string
    {
        if ($count <= 0) {
            return '';
        }

        foreach (['B' => 1000000000, 'M' => 1000000, 'K' => 1000] as $suffix => $threshold) {
            if ($count >= $threshold) {
                $value = $count / $threshold;
                $scaled = $value >= 10 ? (string)round($value) : number_format($value, 1);

                return rtrim(rtrim($scaled, '0'), '.').$suffix;
            }
        }

        return (string)$count;
    }
}
