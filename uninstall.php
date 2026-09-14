<?php
/**
 * What is removed when the plugin is deleted: this plugin's keys inside Divi's shared `et_divi`
 * option, never the option itself, plus its own transients.
 *
 * Standalone on purpose: WordPress runs this without loading the plugin, so there is no autoloader.
 *
 * @package SVHQ_SVI
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

/*
 * Every field UI\ThemeOptionsTab registers, listed here rather than named one at a time.
 *
 * This used to remove the API key alone, so a site that had ever saved Divi's Theme Options kept
 * `svhq_svi_save_history` in `et_divi` forever after the plugin was gone. The key names cannot be
 * derived from the class at this point (uninstall runs with no autoloader), so the one thing that
 * keeps the two in step is that this list is a list: adding a field to ThemeOptionsTab means adding
 * it here, and a list makes that obvious in a way a single unset() did not.
 */
if (!defined('SVHQ_SVI_ET_DIVI_KEYS')):
    define('SVHQ_SVI_ET_DIVI_KEYS', ['svhq_svi_youtube_api_key', 'svhq_svi_save_history']);
endif;

if (!function_exists('svhq_svi_uninstall_site')):
    function svhq_svi_uninstall_site(): void {
        $et_divi = get_option('et_divi');

        if (is_array($et_divi)) {
            $removed = false;

            foreach (SVHQ_SVI_ET_DIVI_KEYS as $key) {
                if (array_key_exists($key, $et_divi)) {
                    unset($et_divi[$key]);
                    $removed = true;
                }
            }

            // Only write when something actually went, so an uninstall never rewrites Divi's whole
            // options row for nothing.
            if ($removed) {
                update_option('et_divi', $et_divi);
            }
        }

        delete_option('svhq_svi_history');

        // The metadata cache and the rate-limit counters are this plugin's only other rows.
        global $wpdb;

        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $names = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
                $wpdb->esc_like('_transient_svhq_svi_').'%',
                $wpdb->esc_like('_transient_timeout_svhq_svi_').'%'
            )
        );
        // phpcs:enable

        foreach ($names as $name) {
            delete_transient(preg_replace('/^_transient_(timeout_)?/', '', $name));
        }
    }
endif;

if (is_multisite()) {
    $svhq_svi_site_ids = get_sites(['fields' => 'ids']);

    foreach ($svhq_svi_site_ids as $svhq_svi_site_id) {
        switch_to_blog($svhq_svi_site_id);
        svhq_svi_uninstall_site();
        restore_current_blog();
    }
} else {
    svhq_svi_uninstall_site();
}
