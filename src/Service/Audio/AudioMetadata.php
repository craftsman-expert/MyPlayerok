<?php

namespace App\Service\Audio;

final class AudioMetadata
{
    public function __construct(
        private readonly ?string $title,
        private readonly ?string $artist,
        private readonly ?string $album,
        private readonly ?string $genre,
        private readonly ?int $duration,
        private readonly ?AudioCover $cover
    ) {
    }

    public static function empty(): self
    {
        return new self(null, null, null, null, null, null);
    }

    public function getTitle(): ?string
    {
        return $this->title;
    }

    public function getArtist(): ?string
    {
        return $this->artist;
    }

    public function getAlbum(): ?string
    {
        return $this->album;
    }

    public function getGenre(): ?string
    {
        return $this->genre;
    }

    public function getDuration(): ?int
    {
        return $this->duration;
    }

    public function getCover(): ?AudioCover
    {
        return $this->cover;
    }
}
