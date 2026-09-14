<?php

namespace SVHQ_SVI;

use SVHQ_SVI\Rest\HistoryController;
use SVHQ_SVI\Rest\ImportController;
use SVHQ_SVI\UI\BuilderBundle;
use SVHQ_SVI\UI\DiviNotice;
use SVHQ_SVI\UI\PluginLinks;
use SVHQ_SVI\UI\ThemeOptionsTab;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The plugin's whole boot: the autoloader, the text domain, and the services that register hooks.
 *
 * There is no wp-admin screen of this plugin's own. The Visual Builder is where it works, and the
 * one setting it saves lives on Divi's own Theme Options screen.
 */
final class Kernel
{
    /** @var array<int, class-string<Bootable>> */
    private const SERVICES = [
        BuilderBundle::class,
        ImportController::class,
        HistoryController::class,
        ThemeOptionsTab::class,
        DiviNotice::class,
        PluginLinks::class,
    ];

    private const NS_PREFIX = 'SVHQ_SVI\\';

    /**
     * NO `load_plugin_textdomain()` CALL, AND THAT IS DELIBERATE.
     *
     * WordPress.org has served a hosted plugin's PHP translations by itself since 4.6, off the
     * slug, and core loads them just in time. `Requires at least` is 6.0, so there is no version
     * this plugin supports where the call does anything core would not. Calling it anyway is how
     * a plugin earns the 6.7 `_load_textdomain_just_in_time` notice, because the call has to land
     * on `init` or later and any string translated before that trips the warning.
     *
     * The constant stays because `wp_set_script_translations()` below still needs it: the JSON
     * catalogues for JavaScript are registered per handle and are not automatic.
     */
    private const TEXT_DOMAIN = 'stackvane-video-import-for-divi';

    /**
     * The version, and the cache buster on every enqueued asset.
     *
     * It must match the plugin header, `readme.txt` `Stable tag` and `package.json`.
     * `npm run zip` reads all four and refuses to build when they disagree.
     */
    public const VERSION = '1.0.0';

    /**
     * WHERE THIS PLUGIN IS, ASKED ONCE AND ANSWERED HERE.
     *
     * There were five global constants for this: Kernel::file(), _DIR, _URL, _VERSION and
     * _BASENAME, each behind its own `if (!defined())` guard. Every one was derived from the same
     * `__FILE__` and they were always read together, so five names were five chances to guard one
     * and forget another, and five entries in a global namespace PHP gives no way to scope.
     *
     * The Kernel already owns the autoloader, the text domain and the service manifest. It is the
     * thing that has to know where the plugin is, so it is the thing that answers.
     *
     * Computed once in `locate()` rather than per call: `plugin_dir_url()` runs `content_url()`
     * and the filters on it, and the bundles ask for the URL on every enqueue.
     */
    private static string $file = '';

    private static string $dir = '';

    private static string $url = '';

    /**
     * @param string $file The plugin's entry file, i.e. `__FILE__` from the file beside src/.
     */
    public static function boot(string $file): void
    {
        self::locate($file);
        self::register_autoloader();

        add_action('plugins_loaded', [self::class, 'load_services']);
    }

    /**
     * The paths, without the hooks.
     *
     * Split out of `boot()` because a test process wants the first half and not the second: it
     * brings its own autoloader and has no WordPress to hook. Calling `boot()` there would
     * register a second autoloader over the one the bootstrap already installed.
     */
    public static function locate(string $file): void
    {
        self::$file = $file;
        self::$dir = untrailingslashit(plugin_dir_path($file));
        self::$url = untrailingslashit(plugin_dir_url($file));
    }

    /** Absolute path to the entry file. The target every lifecycle hook registers against. */
    public static function file(): string
    {
        return self::$file;
    }

    /** Absolute path to the plugin directory, with no trailing slash. */
    public static function dir(): string
    {
        return self::$dir;
    }

    /** Public URL to the plugin directory, with no trailing slash. Every asset src is built from it. */
    public static function url(): string
    {
        return self::$url;
    }

    /**
     * `plugin_basename()` form, for the `plugin_action_links_` filter on the Plugins screen row.
     *
     * Not cached beside the other three, and deliberately: it is asked for at call time so
     * `locate()` needs nothing a bare PHP process cannot answer.
     */
    public static function basename(): string
    {
        return plugin_basename(self::$file);
    }

    /** The JSON catalogues, here so the path cannot disagree with the one build-json.js writes. */
    public static function set_script_translations(string $handle): void
    {
        if (!function_exists('wp_set_script_translations')) {
            return;
        }
        wp_set_script_translations($handle, self::TEXT_DOMAIN, self::$dir.'/languages');
    }

    public static function load_services(): void
    {
        foreach (self::SERVICES as $service) {
            (new $service())->load();
        }
    }

    /** PSR-4: the namespace after the prefix is the path under src/, so adding a folder is free. */
    private static function register_autoloader(): void
    {
        spl_autoload_register(static function (string $class_name): void {
            if (strpos($class_name, self::NS_PREFIX) !== 0) {
                return;
            }

            $relative = substr($class_name, strlen(self::NS_PREFIX));
            $path = self::$dir.'/src/'.str_replace('\\', '/', $relative).'.php';

            if (is_readable($path)) {
                require_once $path;
            }
        });
    }
}
