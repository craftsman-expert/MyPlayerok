<?php

namespace App\Service;

use App\Entity\Track;
use App\Service\Audio\AudioCover;
use App\Service\Audio\AudioMetadata;
use App\Service\Audio\AudioMetadataReader;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\String\Slugger\SluggerInterface;
use function function_exists;
use function mb_convert_case;
use function pathinfo;
use function preg_replace;
use function rtrim;
use function str_replace;
use function strtolower;
use function trim;
use function ucwords;
use const MB_CASE_TITLE;
use const PATHINFO_FILENAME;

class TrackManager
{
    public const UNKNOWN_TITLE = 'Без названия';
    public const UNKNOWN_ARTIST = 'Неизвестный исполнитель';
    public const UNKNOWN_ALBUM = 'Неизвестный альбом';

    private Filesystem $filesystem;

    public function __construct(
        private readonly AudioMetadataReader $metadataReader,
        private readonly SluggerInterface $slugger,
        private readonly string $tracksDirectory,
        private readonly string $coversDirectory,
        private readonly string $projectDirectory
    ) {
        $this->filesystem = new Filesystem();
        $this->filesystem->mkdir([$this->tracksDirectory, $this->coversDirectory]);
    }

    public function handleUpload(Track $track, UploadedFile $audioFile, bool $replaceExisting = false): void
    {
        $safeName = $this->slugger->slug(pathinfo($audioFile->getClientOriginalName() ?: 'track', PATHINFO_FILENAME));
        $extension = $audioFile->guessExtension() ?: $audioFile->getClientOriginalExtension() ?: 'mp3';
        $fileName = sprintf('%s-%s.%s', $safeName, uniqid('', true), $extension);

        $audioFile->move($this->tracksDirectory, $fileName);

        if ($replaceExisting) {
            $this->removeFile($track->getFilePath());
        }

        $absolutePath = $this->tracksDirectory.'/'.$fileName;
        $track->setFilePath($this->relativeFromPublic($absolutePath));

        $metadata = $this->metadataReader->extract($absolutePath);
        $this->applyMetadata($track, $metadata);
    }

    public function guessMetadata(UploadedFile $audioFile): AudioMetadata
    {
        return $this->metadataReader->extract($audioFile->getPathname());
    }

    public function ensureDefaults(Track $track, ?string $originalName = null): void
    {
        if (!$track->getTitle()) {
            $track->setTitle($this->humanizeName($originalName ?? $track->getFilePath()) ?? self::UNKNOWN_TITLE);
        }

        if (!$track->getArtist()) {
            $track->setArtist(self::UNKNOWN_ARTIST);
        }

        if (!$track->getAlbum()) {
            $track->setAlbum(self::UNKNOWN_ALBUM);
        }
    }

    public function removeMedia(Track $track): void
    {
        $this->removeFile($track->getFilePath());
        $this->removeFile($track->getCoverImage());
    }

    private function applyMetadata(Track $track, AudioMetadata $metadata): void
    {
        if ($metadata->getTitle() && !$track->getTitle()) {
            $track->setTitle($metadata->getTitle());
        }

        if ($metadata->getArtist() && !$track->getArtist()) {
            $track->setArtist($metadata->getArtist());
        }

        if ($metadata->getAlbum() && !$track->getAlbum()) {
            $track->setAlbum($metadata->getAlbum());
        }

        if ($metadata->getGenre() && !$track->getGenre()) {
            $track->setGenre($metadata->getGenre());
        }

        if ($metadata->getDuration()) {
            $track->setDuration($metadata->getDuration());
        }

        if ($metadata->getCover()) {
            $this->storeCover($track, $metadata->getCover());
        }

        $this->ensureDefaults($track);
    }

    private function storeCover(Track $track, AudioCover $cover): void
    {
        $extension = $this->extensionFromMime($cover->getMimeType());
        $base = $this->slugger->slug($track->getTitle() ?: 'cover');
        $fileName = sprintf('%s-%s.%s', $base, uniqid('', true), $extension);
        $absolutePath = $this->coversDirectory.'/'.$fileName;

        if ($cover->getBinaryData() === '') {
            return;
        }

        $this->filesystem->dumpFile($absolutePath, $cover->getBinaryData());

        if ($track->getCoverImage()) {
            $this->removeFile($track->getCoverImage());
        }

        $track->setCoverImage($this->relativeFromPublic($absolutePath));
    }

    private function extensionFromMime(string $mimeType): string
    {
        return match ($mimeType) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            default => 'jpg',
        };
    }

    private function relativeFromPublic(string $absolutePath): string
    {
        $publicDir = rtrim($this->projectDirectory.'/public', '/');
        $relative = str_replace($publicDir, '', $absolutePath);

        return ltrim($relative, '/');
    }

    private function removeFile(?string $relativePath): void
    {
        if (!$relativePath) {
            return;
        }

        $absolute = $this->projectDirectory.'/public/'.$relativePath;
        if ($this->filesystem->exists($absolute)) {
            $this->filesystem->remove($absolute);
        }
    }

    private function humanizeName(?string $name): ?string
    {
        if ($name === null) {
            return null;
        }

        $base = pathinfo($name, PATHINFO_FILENAME);
        if (!$base) {
            return null;
        }

        $clean = preg_replace('/[_\-]+/', ' ', $base);
        $clean = preg_replace('/\s+/', ' ', $clean ?? '');
        $clean = trim((string) $clean);

        if ($clean === '') {
            return null;
        }

        return function_exists('mb_convert_case')
            ? mb_convert_case($clean, MB_CASE_TITLE, 'UTF-8')
            : ucwords(strtolower($clean));
    }
}
