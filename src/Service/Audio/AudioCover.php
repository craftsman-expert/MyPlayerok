<?php

namespace App\Service\Audio;

final class AudioCover
{
    public function __construct(
        private readonly string $mimeType,
        private readonly string $binaryData
    ) {
    }

    public function getMimeType(): string
    {
        return $this->mimeType;
    }

    public function getBinaryData(): string
    {
        return $this->binaryData;
    }
}
