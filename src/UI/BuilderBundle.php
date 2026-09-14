<?php

namespace SVHQ_SVI\UI;

use ET\Builder\VisualBuilder\Assets\PackageBuildManager;
use SVHQ_SVI\Bootable;
use SVHQ_SVI\Kernel;
use SVHQ_SVI\Rest\Controller;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Registers no module of its own. This plugin only hooks into the Visual Builder's already
 * registered `divi/video-slider` module, so the bundle it enqueues is one script and one style,
 * never a module dependency tree entry.
 */
class BuilderBundle implements Bootable
{
    private const HANDLE = 'svhq-svi-vb';

    private const STYLE_HANDLE = 'svhq-svi-builder';

    /**
     * Package-build names, not script handles. Only packages Divi registers BEFORE
     * 'divi-modal-library', and never 'divi-module-library', whose registration of
     * divi/video-slider must happen after this bundle's attribute filters.
     *
     * That bundle computes `applyFilters("divi.modalLibrary.modalMapping", ...)` once at parse
     * time, and a dependency forces this script to run after the package named. Naming
     * divi-modal-library, divi-modal or divi-rest would put this past that line, and the modal
     * would silently never register.
     *
     * Registration order: divi-context-library 3911, divi-edit-post 5578, divi-error-boundary
     * 6153, divi-field-library 6572, divi-modal-library 9264, divi-modal 10308, divi-rest 12241.
     */
    private const DEPS = [
        'wp-i18n',
        'react',
        'wp-hooks',
        // window.divi.contextLibrary (moduleContext)
        'divi-context-library',
        // the 'divi/edit-post' store (addModule, getChildModules)
        'divi-edit-post',
        // window.divi.errorBoundary
        'divi-error-boundary',
        // window.divi.fieldLibrary (registerFieldComponent)
        'divi-field-library',
    ];

    public function load(): void
    {
        add_action('divi_visual_builder_assets_before_enqueue_scripts', [$this, 'maybe_enqueue']);
    }

    public function maybe_enqueue(): void
    {
        if (!function_exists('et_builder_d5_enabled') || !et_builder_d5_enabled()) {
            return;
        }
        if (!function_exists('et_core_is_fb_enabled') || !et_core_is_fb_enabled()) {
            return;
        }
        if (!class_exists(PackageBuildManager::class)) {
            return;
        }
        wp_enqueue_style(
            self::STYLE_HANDLE,
            Kernel::url().'/dist/builder.min.css',
            [],
            Kernel::VERSION
        );
        PackageBuildManager::register_package_build(
            [
                'name' => self::HANDLE,
                'version' => Kernel::VERSION,
                'script' => [
                    'src' => Kernel::url().'/dist/builder.min.js',
                    'deps' => self::DEPS,
                    'enqueue_top_window' => false,
                    'enqueue_app_window' => true,
                    'data_app_window' => $this->boot_data(),
                    // Load bearing: in the footer the attribute filters would register too late.
                    'args' => [
                        'in_footer' => false,
                    ],
                ],
            ]
        );
        Kernel::set_script_translations(self::HANDLE);
    }

    /** Divi derives `window.SvhqSviVbData` from the package name; rename both or neither. */
    private function boot_data(): array
    {
        return [
            'restUrl' => Controller::url(),
            'nonce' => wp_create_nonce('wp_rest'),
            'hasApiKey' => '' !== ThemeOptionsTab::api_key(),
            'historyEnabled' => ThemeOptionsTab::history_enabled(),
            // Core's own media route, used when a generated poster is uploaded. Passed rather than
            // assembled in JS so it honours a site that has moved or filtered the REST root.
            'mediaUrl' => esc_url_raw(rest_url('wp/v2/media')),
            'canUpload' => current_user_can('upload_files'),
        ];
    }
}
