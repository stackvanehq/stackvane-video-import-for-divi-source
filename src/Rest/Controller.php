<?php

namespace SVHQ_SVI\Rest;

use SVHQ_SVI\Bootable;
use WP_Error;
use WP_REST_Response;

if (!defined('ABSPATH')) {
    exit;
}

/** The namespace, the registration hook and the two response shapes every controller shares. */
abstract class Controller implements Bootable
{
    public const NAMESPACE = 'svhq-svi/v1';

    /** Where the browser sends its requests. Inlined by the builder bundle. */
    public static function url(): string
    {
        return esc_url_raw(rest_url(self::NAMESPACE));
    }

    public function load(): void
    {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    /**
     * This controller's own routes.
     *
     * @return array<int, array<string, mixed>>
     */
    abstract protected function routes(): array;

    public function register_routes(): void
    {
        foreach ($this->routes() as $route) {
            $args = [
                'methods' => $route['methods'],
                'callback' => $route['callback'],
                'permission_callback' => $route['permission'],
            ];
            if (!empty($route['args'])) {
                $args['args'] = $route['args'];
            }
            register_rest_route(self::NAMESPACE, $route['path'], $args);
        }
    }

    public static function fail($code, $message, $status = 400): WP_Error
    {
        return new WP_Error($code, $message, ['status' => $status]);
    }

    /**
     * Turns a handler's plain array into a response, so no handler repeats the status code.
     *
     * @param mixed $result Handler return value.
     * @return mixed
     */
    public static function respond($result)
    {
        if (is_wp_error($result) || $result instanceof WP_REST_Response) {
            return $result;
        }

        return new WP_REST_Response($result, 200);
    }
}
