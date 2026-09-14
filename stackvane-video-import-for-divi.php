<?php
/**
 * Plugin Name:       StackVane Video Import for Divi
 * Plugin URI:        https://wordpress.org/plugins/stackvane-video-import-for-divi/
 * Description:       Bulk-add videos to Divi's Video Slider from your Media Library, a URL list, or a YouTube playlist, with no new module and no lock-in.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            StackVaneHQ <hello@stackvanehq.com>
 * Author URI:        https://www.stackvanehq.com/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       stackvane-video-import-for-divi
 * Domain Path:       /languages
 *
 * No `Update URI` on purpose. WordPress.org serves updates for a hosted plugin by itself, off the
 * slug; the header exists only to point a SELF-hosted plugin somewhere else. Set to any other host
 * it tells core "this is not the .org plugin", and every update published there stops reaching
 * anyone.
 *
 * @package           SVHQ_SVI
 */

if (!defined('ABSPATH')) {
    exit;
}

/*
 * THIS FILE DEFINES NOTHING GLOBAL, AND THAT IS THE POINT.
 *
 * It used to define five constants: SVHQ_SVI_PLUGIN_FILE, _DIR, _URL, _VERSION and _BASENAME,
 * each behind its own `if (!defined())` guard. All five were derived from the same `__FILE__` and
 * were always read together, so five names bought nothing and cost three things: five chances to
 * guard one and forget another, five entries in a global namespace PHP gives no way to scope, and a
 * version that lived somewhere no class could reach without knowing a string.
 *
 * The Kernel already owns the autoloader, the text domain and the service manifest. It is the thing
 * that has to know where the plugin is, so it is the thing that answers: hand it the entry file and
 * ask it (`Kernel::dir()`, `::url()`, `::file()`, `::basename()`, `Kernel::VERSION`).
 *
 * What is left is what a WordPress entry file cannot delegate: the one require that bootstraps the
 * autoloader, and the lifecycle hooks, which must be registered from this file because
 * `register_activation_hook()` resolves its target relative to the file that calls it.
 */
require_once __DIR__.'/src/Kernel.php';

\SVHQ_SVI\Kernel::boot(__FILE__);
