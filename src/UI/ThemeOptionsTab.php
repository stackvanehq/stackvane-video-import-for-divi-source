<?php

namespace SVHQ_SVI\UI;

use SVHQ_SVI\Bootable;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * One extra tab on Divi's own Theme Options screen, holding the YouTube Data API key.
 *
 * `et_epanel_layout_data` runs during both the render and the save POST, so this one filter both
 * shows the field and lets Divi's own handler store, mask and redisplay it.
 */
class ThemeOptionsTab implements Bootable
{
    public const OPTION_ID = 'svhq_svi_youtube_api_key';

    public const HISTORY_OPTION_ID = 'svhq_svi_save_history';

    /** Off by default: nothing is recorded until the site owner asks for it. */
    private const HISTORY_DEFAULT = 'off';

    /** Divi's nav prints `<a href="#wrap-{tab_slug}">`, so the wrap name must match exactly. */
    private const TAB_SLUG = 'wrap-svhq-svi';

    private const SUBTAB_SLUG = 'svhq-svi-1';

    public function load(): void
    {
        add_filter('et_epanel_layout_data', [$this, 'add_field']);
        add_filter('et_epanel_tab_names', [$this, 'add_tab_name']);
    }

    public function add_tab_name(array $tabs): array
    {
        $tabs['svhq-svi'] = __('StackVane Video Import for Divi', 'stackvane-video-import-for-divi');

        return $tabs;
    }

    /**
     * The exact nesting every tab in Divi's own options_divi.php uses. Fields placed directly in
     * the outer .et-content-div, with no .et-tab-content wrapper, render unstyled and full width.
     */
    public function add_field(array $options): array
    {
        $options[] = ['name' => self::TAB_SLUG, 'type' => 'contenttab-wrapstart'];
        $options[] = ['type' => 'subnavtab-start'];
        $options[] = [
            'name' => self::SUBTAB_SLUG,
            'type' => 'subnav-tab',
            'desc' => __('YouTube', 'stackvane-video-import-for-divi'),
        ];
        $options[] = ['type' => 'subnavtab-end'];
        $options[] = ['name' => self::SUBTAB_SLUG, 'type' => 'subcontent-start'];
        $options[] = [
            'name' => __('YouTube Data API Key', 'stackvane-video-import-for-divi'),
            'id' => self::OPTION_ID,
            'std' => '',
            'type' => 'password',
            'desc' => __(
                'Used By The Video Slider Bulk Importer To Fetch Full Video Titles, Thumbnails, Durations And View Counts From The YouTube Data API. Leave Empty To Use The Free Mode Instead, Which Reads oEmbed And Returns A Title And Thumbnail Only.',
                'stackvane-video-import-for-divi'
            ),
        ];
        $options[] = [
            'name' => __('Save Import History', 'stackvane-video-import-for-divi'),
            'id' => self::HISTORY_OPTION_ID,
            'std' => self::HISTORY_DEFAULT,
            'type' => 'checkbox',
            'desc' => __(
                'Off By Default. Turn This On To Keep A Record Of Every Bulk Import, So A Playlist Can Be Added To Another Slider Later Without Fetching It Again. Turning It Back Off Stops New Records; Entries Already Saved Stay Until You Delete Them From The History Tab.',
                'stackvane-video-import-for-divi'
            ),
        ];
        $options[] = ['name' => self::SUBTAB_SLUG, 'type' => 'subcontent-end'];
        $options[] = ['name' => self::TAB_SLUG, 'type' => 'contenttab-wrapend'];

        return $options;
    }

    public static function api_key(): string
    {
        return function_exists('et_get_option') ? (string)et_get_option(self::OPTION_ID, '') : '';
    }

    /**
     * Whether new imports are recorded.
     *
     * Divi stores 'on' when ticked and 'false' when not, and returns an empty string when the
     * option has never been saved, which is when its own renderer falls back to `std`. Reading it
     * the same way keeps this answer identical to the checkbox the site owner is looking at.
     */
    public static function history_enabled(): bool
    {
        if (!function_exists('et_get_option')) {
            return 'on' === self::HISTORY_DEFAULT;
        }

        $saved = (string)et_get_option(self::HISTORY_OPTION_ID, '');

        return '' === $saved ? 'on' === self::HISTORY_DEFAULT : 'on' === $saved;
    }
}
