<?php

namespace SVHQ_SVI;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * A service that registers hooks. Everything in Kernel::SERVICES answers to this and nothing else.
 */
interface Bootable
{
    public function load(): void;
}
