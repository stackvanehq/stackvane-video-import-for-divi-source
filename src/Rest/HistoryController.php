<?php

namespace SVHQ_SVI\Rest;

use SVHQ_SVI\Store\History;
use WP_REST_Request;
use WP_REST_Response;

if (!defined('ABSPATH')) {
    exit;
}

/** Reading, recording and deleting import history. */
class HistoryController extends Controller
{
    protected function routes(): array
    {
        return [
            [
                'path' => '/history',
                'methods' => 'GET',
                'callback' => [$this, 'get_history'],
                'permission' => [RestPolicy::class, 'import'],
            ],
            [
                'path' => '/history',
                'methods' => 'POST',
                'callback' => [$this, 'add_entry'],
                'permission' => [RestPolicy::class, 'import'],
                'args' => [
                    'source' => [
                        'required' => true,
                        'type' => 'string',
                        'enum' => ['urls', 'playlist'],
                        'sanitize_callback' => [ImportController::class, 'sanitize_string'],
                    ],
                    'label' => [
                        'required' => false,
                        'type' => 'string',
                        'default' => '',
                        'sanitize_callback' => [ImportController::class, 'sanitize_string'],
                    ],
                    'videos' => [
                        'required' => true,
                        'type' => 'array',
                        'validate_callback' => [self::class, 'validate_videos'],
                    ],
                ],
            ],
            [
                'path' => '/history/(?P<id>[A-Za-z0-9\-]+)',
                'methods' => 'DELETE',
                'callback' => [$this, 'delete_entry'],
                'permission' => [RestPolicy::class, 'import'],
                'args' => [
                    'id' => [
                        'required' => true,
                        'type' => 'string',
                        'sanitize_callback' => [ImportController::class, 'sanitize_string'],
                    ],
                ],
            ],
        ];
    }

    /** A non-empty list of objects. History::add() sanitizes each field. */
    public static function validate_videos($value): bool
    {
        if (!is_array($value) || empty($value)) {
            return false;
        }

        foreach ($value as $video) {
            if (!is_array($video)) {
                return false;
            }
        }

        return true;
    }

    public function get_history(WP_REST_Request $request)
    {
        return new WP_REST_Response(['history' => History::all()], 200);
    }

    public function add_entry(WP_REST_Request $request)
    {
        $list = History::add(
            [
                'source' => (string)$request->get_param('source'),
                'label' => (string)$request->get_param('label'),
                'videos' => (array)$request->get_param('videos'),
            ]
        );

        return new WP_REST_Response(['history' => $list], 200);
    }

    public function delete_entry(WP_REST_Request $request)
    {
        return new WP_REST_Response(
            ['history' => History::remove((string)$request->get_param('id'))],
            200
        );
    }
}
