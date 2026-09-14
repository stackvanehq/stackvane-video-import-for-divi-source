<?php

namespace SVHQ_SVI\UI;

use SVHQ_SVI\Bootable;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Says so when Divi 5 is missing, instead of the plugin silently doing nothing.
 *
 * A theme dependency cannot be declared in the plugin header: `Requires Plugins` only accepts
 * slugs of plugins hosted on WordPress.org, so this is checked at runtime.
 */
class DiviNotice implements Bootable
{
    public function load(): void
    {
        add_action('admin_notices', [$this, 'maybe_warn']);
    }

    public function maybe_warn(): void
    {
        if (!current_user_can('activate_plugins') || function_exists('et_builder_d5_enabled')) {
            return;
        }

        printf(
            '<div class="notice notice-warning"><p>%s</p></div>',
            esc_html__(
                'StackVane Video Import for Divi Needs Divi 5 (The Theme Or The Divi Builder Plugin) To Be Active. The Bulk Import Button Appears In The Builder Once Divi 5 Is Enabled.',
                'stackvane-video-import-for-divi'
            )
        );
    }
}
