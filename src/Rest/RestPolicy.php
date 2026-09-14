<?php

namespace SVHQ_SVI\Rest;

use ET\Builder\Framework\UserRole\UserRole;
use WP_Error;
use WP_REST_Request;

if (!defined('ABSPATH')) {
    exit;
}

/** Every permission_callback in the plugin, in one place. */
final class RestPolicy
{
    public static function nonce(WP_REST_Request $request)
    {
        $nonce = $request->get_header('X-WP-Nonce');
        if (!$nonce || !wp_verify_nonce($nonce, 'wp_rest')) {
            return new WP_Error(
                'svhq_svi_bad_nonce',
                __('Your Session Expired. Please Refresh The Page And Try Again.', 'stackvane-video-import-for-divi'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Both gates are load bearing: `edit_posts` keeps a Subscriber out, and Divi's Role Editor
     * answer honours a site that revoked Visual Builder access. Divi's helper alone would be
     * weaker, since it returns `on` for every role until the Role Editor is used once.
     */
    public static function import(WP_REST_Request $request)
    {
        $nonce_ok = self::nonce($request);
        if (is_wp_error($nonce_ok)) {
            return $nonce_ok;
        }

        $allowed = current_user_can('edit_posts');

        if ($allowed && class_exists(UserRole::class)) {
            $allowed = UserRole::can_current_user_use_visual_builder();
        }

        if (!$allowed) {
            return new WP_Error(
                'svhq_svi_forbidden',
                __('You Are Not Allowed To Do This.', 'stackvane-video-import-for-divi'),
                ['status' => 403]
            );
        }

        return true;
    }
}
