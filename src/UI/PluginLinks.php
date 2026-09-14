<?php

namespace SVHQ_SVI\UI;

use SVHQ_SVI\Bootable;
use SVHQ_SVI\Kernel;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The Settings link on this plugin's row on the Plugins screen.
 *
 * It points at Divi's own Theme Options, because that is where this plugin's settings actually
 * live. The link carries no tab fragment: Divi's ePanel picks its open tab in JavaScript and never
 * reads `location.hash`, so a fragment would look like a deep link while doing nothing.
 */
class PluginLinks implements Bootable
{
    private const SETTINGS_PAGE = 'admin.php?page=et_divi_options';

    public function load(): void
    {
        add_filter('plugin_action_links_'.Kernel::basename(), [$this, 'add_settings_link']);
    }

    /**
     * @param array $links Existing action links.
     * @return array Links, with Settings first.
     */
    public function add_settings_link($links): array
    {
        $links = is_array($links) ? $links : [];

        // Divi absent means the Theme Options screen does not exist, so no link is offered.
        if (!function_exists('et_builder_d5_enabled')) {
            return $links;
        }

        array_unshift(
            $links,
            sprintf(
                '<a href="%1$s">%2$s</a>',
                esc_url(admin_url(self::SETTINGS_PAGE)),
                esc_html__('Settings', 'stackvane-video-import-for-divi')
            )
        );

        return $links;
    }
}
